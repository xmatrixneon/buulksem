"use client"

import { useState, useRef, useEffect } from "react"
import { useMutation, useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Unlock, Lock, Filter, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface Lock {
  _id: string
  number: number
  country: string
  service: string
  serviceid: string
  countryid: string
  locked: boolean
  createdAt?: Date
  updatedAt?: Date
}

export default function LocksListWithTRPC() {
  const trpc = useTRPC()

  const [selectedService, setSelectedService] = useState<string>("All")

  // Use tRPC infiniteQueryOptions with TanStack Query's useInfiniteQuery
  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...(trpc.locks.list as any).infiniteQueryOptions(
      {
        service: selectedService === "All" ? undefined : selectedService,
        limit: 50,
      },
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

  // Flatten pages
  const locks = data?.pages.flat() || []

  // Intersection Observer for infinite scroll
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Unlock mutation
  const unlockMutation = useMutation({
    ...trpc.locks.unlock.mutationOptions(),
    onSuccess: () => {
      toast.success("Number unlocked successfully!")
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to unlock")
    },
  })

  // Unlock all mutation
  const unlockAllMutation = useMutation({
    ...trpc.locks.unlockAll.mutationOptions(),
    onSuccess: () => {
      toast.success("All numbers unlocked successfully!")
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to unlock all")
    },
  })

  const handleUnlock = async (id: string) => {
    await unlockMutation.mutateAsync({ id })
  }

  const handleUnlockAll = async () => {
    if (selectedService === "All") {
      toast.error("Please select a service first")
      return
    }
    await unlockAllMutation.mutateAsync({ serviceid: selectedService })
  }

  // Fetch all services for the filter dropdown
  const { data: allServices } = useQuery({
    ...trpc.services.all.queryOptions(),
    refetchOnWindowFocus: false,
  })

  const services = ["All", ...(allServices?.map((s: any) => ({
    id: s.id,
    name: s.name
  })) || [])]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Lock className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Number Locks
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage number locks for services
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter by service:</span>
        </div>
        <Select value={selectedService} onValueChange={setSelectedService}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((service) => (
              <SelectItem key={typeof service === 'string' ? service : service.id} value={typeof service === 'string' ? service : service.id}>
                {typeof service === 'string' ? service : service.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedService !== "All" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlockAll}
            disabled={unlockAllMutation.isPending}
          >
            {unlockAllMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Unlocking...
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 mr-2" />
                Unlock All
              </>
            )}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading locks...</div>
                    </TableCell>
                  </TableRow>
                ) : locks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="text-muted-foreground">No locks found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  locks.map((lock: any) => (
                    <TableRow key={lock._id}>
                      <TableCell className="font-medium">{lock.number}</TableCell>
                      <TableCell>{lock.country || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{lock.service}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={lock.locked ? "default" : "secondary"}>
                          {lock.locked ? (
                            <>
                              <Lock className="h-3 w-3 mr-1" />
                              Locked
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3 mr-1" />
                              Unlocked
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {lock.createdAt
                          ? new Date(lock.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        {lock.locked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlock(lock._id)}
                            disabled={unlockMutation.isPending}
                          >
                            {unlockMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Unlock className="h-4 w-4 mr-1" />
                                Unlock
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Intersection Observer Target */}
      <div ref={observerTarget} className="h-1" />

      {/* Loading indicator */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading more locks...</span>
          </div>
        </div>
      )}

      {/* Result Count */}
      {!isLoading && locks.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {hasNextPage
            ? `Showing ${locks.length} locks (scroll for more...)`
            : `Showing all ${locks.length} locks`
          }
        </div>
      )}
    </div>
  )
}
