# Numbers Page Refactor - Design Specification

**Date:** 2025-05-01
**Status:** Approved
**Priority:** High

## Problem Statement

The Numbers management page (`/dashboard/numberslist`) has three critical bugs:

1. **Country shows "N/A"**: Numbers display "N/A" for country even though country data exists in the database
2. **Search shows duplicates**: Searching for a number results in the same number appearing multiple times
3. **Inactive filter issues**: Filtering for inactive numbers may not work correctly

## Root Cause Analysis

### Issue 1: Country Data Not Populated

The backend `numbers.list` endpoint (`server/src/trpc/router.ts:262-288`) returns raw Numbers data without populating the related Country document:

```typescript
// Current implementation - doesn't include country data
return await prisma.numbers.findMany({
  where,
  take: params.limit,
  skip: params.offset,
  orderBy: { updatedAt: 'desc' }
})
```

The frontend expects `n.countryid?.name` but receives only an ObjectId string.

### Issue 2: Client-Side Filtering with Infinite Scroll

The frontend does client-side filtering on paginated data from infinite scroll:

```typescript
// numberslist/page.tsx:163-170
const filteredNumbers = numbers
  .filter((n: any) => n.number.toString().includes(search))
  .filter((n: any) => { /* status filter */ })
```

This causes issues because:
- Filtering happens after pagination, so filtered results may not include all matches
- The same data may appear in multiple pages when filters change
- The infinite query continues fetching pages even when filtering

### Issue 3: No Debouncing on Search Input

Search input changes trigger immediate re-filtering without debouncing, causing excessive re-renders.

## Design Solution

### 1. Backend Changes (`server/src/trpc/router.ts`)

#### Modify `numbers.list` Endpoint

**Location:** `/server/src/trpc/router.ts` lines 262-288

**Changes:**
1. Add country data population using Prisma relation or manual lookup
2. Add server-side filtering parameters
3. Return consistent pagination

```typescript
numbers: router({
  list: publicProcedure
    .input(z.object({
      active: z.boolean().optional(),
      suspended: z.boolean().optional(),
      countryid: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const params = input || { limit: 50, offset: 0 }
      const where: any = {}

      if (params.active !== undefined) where.active = params.active
      if (params.suspended !== undefined) where.suspended = params.suspended
      if (params.countryid) where.countryid = params.countryid
      if (params.search) {
        where.number = { contains: params.search }
      }

      // Fetch numbers with country data
      const numbers = await prisma.numbers.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { updatedAt: 'desc' }
      })

      // Populate country data for each number
      const numbersWithCountry = await Promise.all(
        numbers.map(async (number) => {
          let country = null
          if (number.countryid) {
            country = await prisma.country.findFirst({
              where: { id: number.countryid }
            })
          }

          return {
            ...number,
            countryid: country ? {
              _id: country.id,
              name: country.name,
              flag: country.flag,
              code: country.code
            } : null
          }
        })
      )

      return numbersWithCountry
    }),
```

**Alternative (more efficient for large datasets):**

Use a single query with aggregation or lookup if available in Prisma MongoDB.

### 2. Frontend Changes (`client/app/dashboard/numberslist/page.tsx`)

#### A. Add Debounced Search Input

**Location:** After imports, around line 56

```typescript
// Add debounced search hook
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
```

#### B. Update Query to Use Server-Side Filters

**Location:** Lines 70-91, modify the infinite query

```typescript
const [search, setSearch] = useState("")
const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")

// Debounce search input
const debouncedSearch = useDebounce(search, 300)

// Build query parameters
const queryParams = {
  limit: 50,
  search: debouncedSearch || undefined,
  active: filter === "all" ? undefined : filter === "active" ? true : false
}

const {
  data,
  isLoading,
  refetch,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  ...(trpc.numbers.list as any).infiniteQueryOptions(
    queryParams,
    {
      getNextPageParam: (lastPage: any, allPages: any) => {
        if (!lastPage || lastPage.length < 50) return undefined
        return allPages.flat().length
      },
    }
  ),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
})

// Remove client-side filtering - data is now filtered server-side
const numbers = data?.pages.flat() || []
```

#### C. Update Filter Change Handler

**Location:** Lines 252-264, update the Select onValueChange

```typescript
<Select
  value={filter}
  onValueChange={(value: any) => {
    setFilter(value)
    // Refetch with new filter immediately
    refetch()
  }}
>
```

#### D. Fix Render Loop (Remove filteredNumbers)

**Location:** Lines 163-170, 298-340

**Remove:**
```typescript
// Remove this entire section
const filteredNumbers = numbers
  .filter((n: any) => n.number.toString().includes(search))
  .filter((n: any) => {
    if (filter === "active") return n.active
    if (filter === "inactive") return !n.active
    return true
  })
  .sort((a: any, b: any) => (a.active === b.active ? 0 : a.active ? -1 : 1))
```

**Replace all `filteredNumbers` references with `numbers`** in the render function.

#### E. Update Country Cell Rendering

**Location:** Lines 301-311

```typescript
<TableCell>
  <div className="flex items-center gap-2">
    {n.countryid?.flag && (
      <img
        src={n.countryid.flag}
        alt={n.countryid.name}
        className="w-5 h-5 rounded-full"
      />
    )}
    <span>{n.countryid?.name || "Unknown"}</span>
  </div>
</TableCell>
```

### 3. Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| Country Display | "N/A" (ObjectId not resolved) | Shows country name and flag |
| Search Performance | Client-side, instant (excessive re-renders) | Debounced 300ms, server-side |
| Filter Performance | Client-side on loaded pages only | Server-side, all data accessible |
| Pagination | Issues with duplicates when filtering | Consistent pagination with filters |
| Data Consistency | May miss data when filtering | All filtered data accessible via infinite scroll |

### 4. Edge Cases Handled

1. **Empty search**: Don't send undefined search parameter to backend
2. **Filter switching**: Reset infinite query when filter changes
3. **Race conditions**: Debounce prevents rapid successive queries
4. **Missing country data**: Display "Unknown" instead of "N/A"
5. **No results**: Show appropriate empty state

### 5. Testing Checklist

- [ ] Country name and flag display correctly
- [ ] Search works for both active and inactive numbers
- [ ] No duplicate numbers appear in search results
- [ ] Filter dropdown (All/Active/Inactive) works correctly
- [ ] Infinite scroll continues to load more filtered results
- [ ] Debouncing prevents excessive API calls
- [ ] Empty states display correctly
- [ ] Loading states work properly
- [ ] Refresh button refetches data correctly

## Implementation Order

1. **Backend first**: Modify `numbers.list` endpoint to populate country data
2. **Frontend query**: Update to use server-side filters
3. **Add debouncing**: Implement useDebounce hook
4. **Remove client filtering**: Clean up filteredNumbers logic
5. **Test**: Verify all functionality works

## Files Modified

1. `/server/src/trpc/router.ts` - Backend API
2. `/client/app/dashboard/numberslist/page.tsx` - Frontend page

## Future Considerations

- Consider adding a separate `count` query to get accurate filtered counts
- Consider implementing React Query's `useQuery` with proper cache key management
- Consider adding loading skeletons for better UX
- Consider adding virtualization for very large datasets (1000+ records)

## Notes

- The current implementation uses manual country lookup which may be slower for large datasets
- For production with >10,000 numbers, consider database-level aggregation or a caching layer
- The 300ms debounce is a reasonable default but can be adjusted based on user feedback
