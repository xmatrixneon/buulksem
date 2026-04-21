"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Filter, Calendar, MessageSquare, RefreshCw, History } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface Country {
  _id: string
  name: string
  flag: string
  code: string
  dialcode: number
}

interface Service {
  _id: string
  name: string
  code: string
  image?: string
}

interface Order {
  _id: string
  number: number
  countryid: string
  serviceid: string
  createdAt: Date
  isused: boolean
  active: boolean
  message?: string[]
  country?: Country
  service?: Service
}

export default function OrdersPageWithTRPC() {
  const trpc = useTRPC()

  const [selectedMessages, setSelectedMessages] = useState<string[] | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // tRPC query for fetching activation data
  const {
    data: orders = [],
    isLoading,
    refetch
  } = useQuery({
    ...trpc.overview.data.queryOptions({
      limit: 100,
      startDate: from || undefined,
      endDate: to || undefined
    }),
    refetchOnWindowFocus: false,
  })

  // Filter orders
  const filteredOrders = orders.filter((order: any) => {
    const matchesSearch =
      !search ||
      order.number?.toString().includes(search) ||
      order.country?.name?.toLowerCase().includes(search.toLowerCase()) ||
      order.service?.name?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && order.active) ||
      (statusFilter === "completed" && !order.active && order.isused) ||
      (statusFilter === "expired" && !order.active && !order.isused)

    return matchesSearch && matchesStatus
  })

  const formatIST = (dateStr: Date) => {
    const date = new Date(dateStr)
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    })
  }

  const getOrderStatus = (order: Order) => {
    if (!order.active) {
      if (order.isused) {
        return <Badge className="bg-green-600 hover:bg-green-700">Success</Badge>
      }
      return <Badge variant="destructive">Expired</Badge>
    }
    if (order.isused) {
      return <Badge className="bg-green-600 hover:bg-green-700">Received</Badge>
    }
    return <Badge className="bg-blue-600 hover:bg-blue-700">Active</Badge>
  }

  const handleDateFilter = () => {
    refetch()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Activation History
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            View SMS activation orders with filtering and search
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full"
        />
        <Button onClick={handleDateFilter} disabled={isLoading}>
          Filter by Date
        </Button>
      </div>

      {/* Search and Status Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search by number, country, or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading orders...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="text-muted-foreground">No orders found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order: any) => (
                    <TableRow key={order._id}>
                      <TableCell className="font-medium">{order.number}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {order.country?.flag && (
                            <img
                              src={order.country.flag}
                              alt={order.country.name}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span>{order.country?.name || "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {order.service?.image && (
                            <img
                              src={order.service.image}
                              alt={order.service.name}
                              className="w-5 h-5 rounded"
                            />
                          )}
                          <span>{order.service?.name || "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getOrderStatus(order)}</TableCell>
                      <TableCell>
                        {order.createdAt ? formatIST(new Date(order.createdAt)) : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Message View Dialog */}
      <Dialog open={selectedMessages !== null} onOpenChange={(open) => !open && setSelectedMessages(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Messages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedMessages && selectedMessages.length > 0 ? (
              selectedMessages.map((msg, index) => (
                <div key={index} className="p-3 bg-muted rounded">
                  <p className="text-sm">{msg}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No messages received for this order yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedMessages(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
