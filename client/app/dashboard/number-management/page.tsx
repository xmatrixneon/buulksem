'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Activity, RefreshCw, Shield, Signal, Phone, CheckCircle2, XCircle, AlertTriangle, Search } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from 'sonner'

interface Number {
  _id: string;
  number: number;
  qualityScore: number;
  suspended: boolean;
  suspensionReason: string;
  consecutiveFailures: number;
  failureCount: number;
  successCount: number;
  active: boolean;
  operator: string;
  signal: number;
  port: string;
  locked: boolean;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  suspendedAt?: string;
  lastRotation?: string;
  smsReceivedInWindow?: number;
}

export default function NumberManagement() {
  const trpc = useTRPC()
  const [filter, setFilter] = useState<'all' | 'suspended' | 'warning' | 'active'>('all');
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Use tRPC infiniteQueryOptions with TanStack Query's useInfiniteQuery
  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...(trpc.numbers.quality as any).infiniteQueryOptions(
      { filter, search: search || undefined },
      {
        getNextPageParam: (lastPage: any, allPages: any) => {
          if (!lastPage?.data || lastPage.data.length < 50) return undefined
          return allPages.length + 1
        },
        initialCursor: 1,
      }
    ),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Flatten pages
  const numbers = data?.pages.flatMap((p: any) => p?.data || []) || []
  const stats = (data?.pages?.[0] as any)?.stats || {
    totalCount: 0,
    activeCount: 0,
    suspendedCount: 0,
    avgQuality: 0
  }

  // Numbers are now filtered server-side, no client-side filtering needed

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

  // tRPC mutation for bulk actions
  const bulkActionMutation = useMutation({
    ...trpc.numbers.bulkAction.mutationOptions(),
    onSuccess: (result) => {
      toast.success(`${result.action} completed for ${result.count} numbers`)
      setSelectedNumbers(new Set())
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Action failed')
    }
  })

  const handleSelectAll = () => {
    if (selectedNumbers.size === numbers.length) {
      setSelectedNumbers(new Set());
    } else {
      setSelectedNumbers(new Set(numbers.map((n: any) => n.number)));
    }
  };

  const handleSelectNumber = (number: number) => {
    const newSelected = new Set(selectedNumbers);
    if (newSelected.has(number)) {
      newSelected.delete(number);
    } else {
      newSelected.add(number);
    }
    setSelectedNumbers(newSelected);
  };

  const handleBulkAction = (action: 'suspend' | 'recover' | 'reset') => {
    if (selectedNumbers.size === 0) {
      toast.error('Please select at least one number');
      return;
    }

    bulkActionMutation.mutate({
      numbers: Array.from(selectedNumbers),
      action,
      reason: 'manual'
    });
  };

  const getQualityBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">{score}</Badge>;
    if (score >= 50) return <Badge variant="secondary">{score}</Badge>;
    if (score >= 30) return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">{score}</Badge>;
    return <Badge variant="destructive">{score}</Badge>;
  };

  const getSuspensionReasonBadge = (reason: string) => {
    const reasonLabels: Record<string, string> = {
      'none': 'None',
      'low_quality': 'Low Quality',
      'manual': 'Manual',
      'high_failure_rate': 'High Failure',
      'no_recharge': 'No Recharge',
      'low_sms': 'Low SMS'
    };
    return reasonLabels[reason] || reason;
  };

  const renderSignal = (sig: number) => {
    // Handle undefined/null/0 as "No Signal"
    if (sig === null || sig === undefined || sig === 0) {
      return <Badge variant="outline"><Signal className="h-3 w-3 mr-1" />No Signal</Badge>;
    }
    // Display signal strength
    const variant = sig < 8 ? "destructive" : sig < 12 ? "secondary" : "default";
    return (
      <Badge variant={variant} className="gap-1">
        <Signal className="h-3 w-3" />
        {sig}
      </Badge>
    );
  };

  // Stats are now fetched from API
  const { totalCount, activeCount, suspendedCount, avgQuality } = stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 md:h-8 md:w-8" />
            Number Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage all numbers with bulk actions and quality controls
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Numbers</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{suspendedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(avgQuality)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value: any) => {
            setFilter(value);
            setSelectedNumbers(new Set());
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Numbers</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="warning">At Risk</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedNumbers.size > 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-blue-800 dark:text-blue-200 font-medium">
                {selectedNumbers.size} number{selectedNumbers.size > 1 ? 's' : ''} selected
              </span>
              <Button
                onClick={() => handleBulkAction('recover')}
                disabled={bulkActionMutation.isPending}
                size="sm"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Recover
              </Button>
              <Button
                onClick={() => handleBulkAction('suspend')}
                disabled={bulkActionMutation.isPending}
                variant="destructive"
                size="sm"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Suspend
              </Button>
              <Button
                onClick={() => handleBulkAction('reset')}
                disabled={bulkActionMutation.isPending}
                variant="outline"
                size="sm"
              >
                <Shield className="h-4 w-4 mr-2" />
                Reset Quality
              </Button>
              <Button
                onClick={() => setSelectedNumbers(new Set())}
                variant="ghost"
                size="sm"
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Numbers Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-12 flex-1" />
                </div>
              ))}
            </div>
          ) : numbers.length === 0 ? (
            <div className="text-center py-16">
              <Phone className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground text-lg">No numbers found</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedNumbers.size === numbers.length && numbers.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Signal</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead>Locked</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Success</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {numbers.map((number: any) => (
                      <TableRow key={number._id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedNumbers.has(number.number)}
                            onCheckedChange={() => handleSelectNumber(number.number)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{number.number}</TableCell>
                        <TableCell>{getQualityBadge(number.qualityScore)}</TableCell>
                        <TableCell>
                          {number.suspended ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Suspended
                            </Badge>
                          ) : number.active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {number.suspended ? (
                            <Badge variant="outline" className="text-xs">
                              {getSuspensionReasonBadge(number.suspensionReason)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>{number.operator || 'N/A'}</TableCell>
                        <TableCell>{renderSignal(number.signal)}</TableCell>
                        <TableCell className="font-mono text-xs">{number.port || 'N/A'}</TableCell>
                        <TableCell>
                          {number.locked ? (
                            <Badge variant="secondary">Locked</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{number.consecutiveFailures}</TableCell>
                        <TableCell>{number.successCount || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Intersection Observer Target */}
              <div ref={observerTarget} className="h-1" />

              {/* Loading indicator */}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Loading more numbers...
                </div>
              )}

              {/* Real count display */}
              {numbers.length > 0 && (
                <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                  {hasNextPage
                    ? `Showing ${numbers.length} of ${totalCount} total numbers (scroll for more...)`
                    : search
                      ? `Showing ${numbers.length} of ${totalCount} total numbers (filtered)`
                      : `Showing all ${totalCount} numbers`
                  }
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
