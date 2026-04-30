"use client";

import { useState, useRef, useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { formatDistanceToNow } from "date-fns";
import { Lock, Unlock, Trash2, Signal, Search, Phone, RefreshCw, BarChart3, Wifi, Globe, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface NumberData {
  _id: string;
  number: number;
  active: boolean;
  port?: string;
  signal?: number;
  operator?: string;
  lastRotation?: Date;
  countryid?: {
    _id: string;
    name: string;
    flag: string;
    code: string;
  };
}

export default function NumbersGridWithTRPC() {
  const trpc = useTRPC();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [numberToDelete, setNumberToDelete] = useState<string | null>(null);

  // Get real database counts from overview API
  const { data: overviewData } = useQuery({
    ...trpc.overview.activation.queryOptions(),
    refetchOnWindowFocus: false,
  });

  // Infinite scroll with Context7 best practices
  const {
    data: infiniteData,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['numbers'],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await fetch(`/trpc/numbers.list?input=${encodeURIComponent(JSON.stringify({
        limit: 50, // Reasonable page size
        offset: pageParam,
      }))}`)
      if (!result.ok) throw new Error('Failed to fetch')
      const data = await result.json()
      return data.result.data.json
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Context7: return undefined when no more data
      if (!lastPage || lastPage.length < 50) return undefined
      return allPages.length * 50
    },
    maxPages: 5, // Context7: limit stored pages for performance
  });

  // Flatten pages - API returns array directly
  const numbers = infiniteData?.pages.flat() || [];

  // Intersection Observer for infinite scroll (Context7 best practice)
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Note: You'll need to add a delete mutation to the server if it doesn't exist
      return await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/numbers/delete/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast.success("Number deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setNumberToDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete number");
    },
  });

  const handleDelete = async () => {
    if (!numberToDelete) return;
    await deleteMutation.mutateAsync(numberToDelete);
  };

  const openDeleteDialog = (id: string) => {
    setNumberToDelete(id);
    setDeleteDialogOpen(true);
  };

  const renderSignal = (sig: number) => {
    if (!sig || sig === 0)
      return <Badge variant="outline">No Signal</Badge>;
    const variant = sig < 8 ? "destructive" : sig < 12 ? "secondary" : "default";
    return (
      <Badge variant={variant} className="gap-1">
        <Signal size={16} />
        {sig}
      </Badge>
    );
  };

  // Client-side filtering (search and status filter)
  const filteredNumbers = numbers
    .filter((n: any) => n.number.toString().includes(search))
    .filter((n: any) => {
      if (filter === "active") return n.active;
      if (filter === "inactive") return !n.active;
      return true;
    })
    .sort((a: any, b: any) => (a.active === b.active ? 0 : a.active ? -1 : 1));

  // Real database counts from overview API (not based on scroll limit)
  const totalCount = overviewData?.totalNumbers ?? 0;
  const activeCount = overviewData?.activeNumbers ?? 0;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            SIM Numbers
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage and monitor all your SIM numbers
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Total Numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-2">
              <Phone className="h-6 w-6 text-primary" />
              {totalCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Active Numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary flex items-center gap-2">
              <Wifi className="h-6 w-6" />
              {activeCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Signal className="h-4 w-4" />
              Inactive Numbers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive flex items-center gap-2">
              <Signal className="h-6 w-6" />
              {inactiveCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search numbers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value: any) => setFilter(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Numbers</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
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
                  <TableHead>Operator</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Rotation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading numbers...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredNumbers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="text-muted-foreground">No numbers found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNumbers.map((n: any) => (
                    <TableRow key={n._id}>
                      <TableCell className="font-medium">{n.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {n.countryid?.flag && (
                            <img
                              src={n.countryid.flag}
                              alt={n.countryid.name}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span>{n.countryid?.name || "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{n.operator || "Unknown"}</TableCell>
                      <TableCell>{n.port || "-"}</TableCell>
                      <TableCell>{renderSignal(n.signal)}</TableCell>
                      <TableCell>
                        <Badge variant={n.active ? "default" : "destructive"}>
                          {n.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {n.lastRotation
                          ? formatDistanceToNow(new Date(n.lastRotation), {
                              addSuffix: true,
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteDialog(n._id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
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
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          Loading more numbers...
        </div>
      )}

      {/* Result Count */}
      {!isLoading && filteredNumbers.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {hasNextPage
            ? `Showing ${numbers.length} of ${totalCount} total numbers (scroll for more...)`
            : search || filter !== "all"
              ? `Showing ${filteredNumbers.length} of ${totalCount} total numbers (filtered)`
              : `Showing all ${totalCount} numbers`
          }
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the number{" "}
              {numberToDelete && numbers.find((n: any) => n._id === numberToDelete)?.number}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
