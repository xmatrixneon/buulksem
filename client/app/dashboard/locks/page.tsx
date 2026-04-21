"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
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
  locked: boolean
  createdAt?: Date
  updatedAt?: Date
}

export default function LocksListWithTRPC() {
  const trpc = useTRPC()

  const [selectedService, setSelectedService] = useState<string>("All")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // tRPC query for fetching locks
  const {
    data: locks = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.locks.list.queryOptions(),
    refetchOnWindowFocus: false,
  })

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

  // Filter locks
  const filteredLocks = locks.filter((lock: any) =>
    selectedService === "All" || lock.service === selectedService
  )

  // Get unique services
  const services = ["All", ...Array.from(new Set(locks.map((lock: any) => lock.service)))]

  // Pagination
  const totalPages = Math.ceil(filteredLocks.length / itemsPerPage)
  const paginatedLocks = filteredLocks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

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
              <SelectItem key={service} value={service}>
                {service}
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
                ) : paginatedLocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="text-muted-foreground">No locks found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLocks.map((lock: any) => (
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
                          ? new Date(lock.createdAt).toLocaleDateString()
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

      {/* Pagination */}
      {!isLoading && filteredLocks.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min(filteredLocks.length, (currentPage - 1) * itemsPerPage + 1)}-
            {Math.min(currentPage * itemsPerPage, filteredLocks.length)} of{" "}
            {filteredLocks.length} locks
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
