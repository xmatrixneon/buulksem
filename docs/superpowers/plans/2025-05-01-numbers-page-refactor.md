# Numbers Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in the Numbers management page: country showing "N/A", search showing duplicates, and inactive filter issues by moving filtering to server-side and adding proper data population.

**Architecture:** Backend API modification to populate country data with server-side filtering, frontend refactor to use debounced search with server-side filters, removing client-side filtering that causes inconsistencies.

**Tech Stack:** Node.js/TypeScript (Express, Prisma, tRPC), React (Next.js 15, TanStack Query, shadcn/ui)

---

## File Structure

**Files to modify:**
1. `server/src/trpc/router.ts` - Backend numbers.list endpoint (add country population)
2. `client/app/dashboard/numberslist/page.tsx` - Frontend Numbers page (add debouncing, remove client filtering)

**No new files will be created.**

---

## Task 1: Backend - Add Country Population to numbers.list Endpoint

**Files:**
- Modify: `server/src/trpc/router.ts:262-288`

- [ ] **Step 1: Read the current numbers.list endpoint**

```bash
cat server/src/trpc/router.ts | sed -n '262,288p'
```

Expected output: Current numbers list query without country population

- [ ] **Step 2: Modify the numbers.list endpoint to populate country data**

Find the `numbers.list` query in `server/src/trpc/router.ts` (around line 262) and replace it with:

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

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd server && npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 4: Build the backend**

```bash
cd server && npm run build
```

Expected: Build succeeds without errors

- [ ] **Step 5: Commit backend changes**

```bash
git add server/src/trpc/router.ts
git commit -m "$(cat <<'EOF'
fix(numbers): populate country data in numbers.list endpoint

- Modify numbers.list to fetch and include country details
- Returns country object with _id, name, flag, and code
- Fixes "N/A" display issue in frontend Numbers table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend - Add useDebounce Hook

**Files:**
- Modify: `client/app/dashboard/numberslist/page.tsx`

- [ ] **Step 1: Add useDebounce hook after imports**

Add this hook function after the imports (around line 39, after `toast` import):

```typescript
// Debounce hook for search input
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

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd client && npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit debounce hook addition**

```bash
git add client/app/dashboard/numberslist/page.tsx
git commit -m "$(cat <<'EOF'
feat(numbers): add useDebounce hook for search input

- Implements 300ms debounce to prevent excessive re-renders
- Will be used with debounced search in subsequent changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Frontend - Update Query to Use Server-Side Filters

**Files:**
- Modify: `client/app/dashboard/numberslist/page.tsx:59-91`

- [ ] **Step 1: Add debounced search state and update query parameters**

Replace the state declarations and infinite query section (lines 59-91) with:

```typescript
const [search, setSearch] = useState("");
const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [numberToDelete, setNumberToDelete] = useState<string | null>(null);

// Debounce search input (300ms delay)
const debouncedSearch = useDebounce(search, 300);

// Build query parameters for server-side filtering
const queryParams = {
  limit: 50,
  search: debouncedSearch || undefined,
  active: filter === "all" ? undefined : filter === "active" ? true : false
};

// Use tRPC infiniteQueryOptions with TanStack Query's useInfiniteQuery
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
});

// Flatten pages - API returns array directly
const numbers = data?.pages.flat() || [];
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd client && npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit query changes**

```bash
git add client/app/dashboard/numberslist/page.tsx
git commit -m "$(cat <<'EOF'
feat(numbers): use server-side filtering with debounced search

- Pass search and active filter to backend API
- Debounce search input with 300ms delay
- Remove dependency on client-side filtering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend - Remove Client-Side Filtering

**Files:**
- Modify: `client/app/dashboard/numberslist/page.tsx`

- [ ] **Step 1: Remove the filteredNumbers computation**

Find and remove the filteredNumbers section (lines 163-170):

```typescript
// Remove this entire section:
// Client-side filtering (search and status filter)
const filteredNumbers = numbers
  .filter((n: any) => n.number.toString().includes(search))
  .filter((n: any) => {
    if (filter === "active") return n.active;
    if (filter === "inactive") return !n.active;
    return true;
  })
  .sort((a: any, b: any) => (a.active === b.active ? 0 : a.active ? -1 : 1));
```

- [ ] **Step 2: Replace all filteredNumbers references with numbers**

In the render function, replace all instances of `filteredNumbers` with `numbers`:
- Line 291: `filteredNumbers.length === 0` → `numbers.length === 0`
- Line 298: `filteredNumbers.map` → `numbers.map`
- Line 359: `filteredNumbers.length > 0` → `numbers.length > 0`
- Line 360: `filteredNumbers.length` → `numbers.length`

- [ ] **Step 3: Update country cell display text**

Find the country TableCell (around line 310) and change "N/A" to "Unknown":

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

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd client && npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 5: Commit removal of client filtering**

```bash
git add client/app/dashboard/numberslist/page.tsx
git commit -m "$(cat <<'EOF'
refactor(numbers): remove client-side filtering

- Remove filteredNumbers computation
- Use server-filtered data directly
- Update country display from "N/A" to "Unknown"
- Fixes duplicate results when searching

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend - Add Filter Change Handler with Refetch

**Files:**
- Modify: `client/app/dashboard/numberslist/page.tsx:252-264`

- [ ] **Step 1: Update Select onValueChange to refetch data**

Find the Select component for filter dropdown and update onValueChange:

```typescript
<Select
  value={filter}
  onValueChange={(value: any) => {
    setFilter(value);
    // Refetch with new filter immediately
    refetch();
  }}
>
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd client && npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 3: Commit filter handler change**

```bash
git add client/app/dashboard/numberslist/page.tsx
git commit -m "$(cat <<'EOF'
fix(numbers): refetch data when filter changes

- Add refetch() call to filter dropdown change handler
- Ensures data updates immediately when switching between All/Active/Inactive

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Testing and Verification

**Files:**
- No file modifications

- [ ] **Step 1: Restart the backend server**

```bash
cd server && pm2 restart sms-gateway
```

Expected: Server restarts successfully

- [ ] **Step 2: Restart the frontend**

```bash
pm2 restart sms-frontend
```

Expected: Frontend restarts successfully

- [ ] **Step 3: Test country display**

1. Navigate to https://syncmesh-datacore.shop/dashboard/numberslist
2. Verify that country names and flags are displayed (not "N/A")
3. Check that numbers without countries show "Unknown"

Expected: Countries display correctly with flags

- [ ] **Step 4: Test search functionality**

1. Type a number in the search box (e.g., "7080589861")
2. Wait for debounce (300ms)
3. Verify results appear without duplicates
4. Clear search and verify all numbers appear

Expected: Search works without duplicate results

- [ ] **Step 5: Test filter dropdown**

1. Select "Active Only" from filter dropdown
2. Verify only active numbers are shown
3. Select "Inactive Only" from filter dropdown
4. Verify only inactive numbers are shown
5. Select "All Numbers" from filter dropdown
6. Verify all numbers are shown

Expected: Filter works correctly for all options

- [ ] **Step 6: Test combined search and filter**

1. Select "Inactive Only" filter
2. Type a search term
3. Verify search works within inactive numbers

Expected: Combined search and filter works correctly

- [ ] **Step 7: Test infinite scroll**

1. Scroll to the bottom of the list
2. Verify more numbers load automatically
3. Test infinite scroll with filter applied

Expected: Infinite scroll works with filters applied

- [ ] **Step 8: Check browser console for errors**

Open browser DevTools console and verify no errors

Expected: No console errors

- [ ] **Step 9: Check backend logs**

```bash
pm2 logs sms-gateway --lines 50
```

Expected: No error logs related to numbers endpoint

---

## Task 7: Final Documentation and Cleanup

**Files:**
- No file modifications

- [ ] **Step 1: Update implementation plan status**

Edit `docs/superpowers/plans/2025-05-01-numbers-page-refactor.md` and add completion note at the end:

```markdown
## Completion Status

**Completed:** 2025-05-01

All tasks completed successfully. The Numbers page now:
- Displays country names and flags correctly
- Uses server-side filtering to prevent duplicate results
- Has debounced search input (300ms) for better performance
- Properly filters by active/inactive status

All tests pass and functionality verified in production.
```

- [ ] **Step 2: Final commit**

```bash
git add docs/superpowers/plans/2025-05-01-numbers-page-refactor.md
git commit -m "docs: mark Numbers page refactor as complete"
```

---

## Self-Review Checklist

**Spec Coverage:**
- [x] Country population from backend
- [x] Server-side filtering implementation
- [x] Debounced search input
- [x] Removal of client-side filtering
- [x] Filter change handler with refetch
- [x] Country display updated ("Unknown" instead of "N/A")
- [x] Testing and verification steps

**Placeholder Scan:**
- [x] No TBD/TODO placeholders
- [x] All code steps have complete implementation
- [x] All commands have expected outputs
- [x] No "similar to previous task" references

**Type Consistency:**
- [x] Filter values: "all", "active", "inactive"
- [x] Query parameters: limit, search, active
- [x] Country object structure: _id, name, flag, code
- [x] Function names consistent across tasks

**Files Modified:**
1. `server/src/trpc/router.ts` - numbers.list endpoint with country population
2. `client/app/dashboard/numberslist/page.tsx` - debounced search, server-side filters, removed client filtering
