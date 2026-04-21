"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, RefreshCw, ShoppingBag, Clock, CheckCircle, XCircle, Phone } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface Order {
  id: string
  _id: string
  number: number
  countryid: string
  serviceid: string
  country: string
  service: string
  countryData?: {
    id: string
    name: string
    flag: string
    code: string
    dialcode: number
  }
  serviceData?: {
    id: string
    name: string
    code: string
    image: string
  }
  dialcode: number
  active: boolean
  isused: boolean
  message: string[]
  maxmessage: number
  createdAt: Date
  updatedAt: Date
}

export default function ActiveOrdersPageWithTRPC() {
  const trpc = useTRPC()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // tRPC query for fetching orders (all orders for proper stats)
  const {
    data: orders = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.orders.list.queryOptions({
      limit: 100,
      offset: 0,
    }),
    refetchOnWindowFocus: false,
  })

  // Filter orders - ONLY show active orders (waiting for OTP)
  const activeOrdersList = orders.filter((order: any) => !order.isused)  // Only waiting for OTP

  const filteredOrders = activeOrdersList.filter((order: any) => {
    const matchesSearch =
      order.number?.toString().includes(search) ||
      order.country?.toLowerCase().includes(search.toLowerCase()) ||
      order.service?.toLowerCase().includes(search.toLowerCase())

    return matchesSearch
  })

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Stats - Total orders (all), Active (waiting for OTP and still active)
  const totalOrders = orders.length
  const activeOrders = activeOrdersList.filter((o: any) => o.active).length

  const getStatusBadge = (order: Order) => {
    // If OTP has been received, it's completed
    if (order.isused) {
      return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>
    }
    // If order is no longer active but never received OTP, it's expired
    if (!order.active) {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Expired</Badge>
    }
    // Still active and waiting for OTP
    return <Badge className="bg-blue-500 hover:bg-blue-600"><Clock className="h-3 w-3 mr-1" /> Active</Badge>
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Active Orders
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Monitor and manage SMS activation orders
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{activeOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search (only searching active orders) */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search active orders..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Number</th>
                  <th className="text-left p-4 font-medium">Country</th>
                  <th className="text-left p-4 font-medium">Service</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Used</th>
                  <th className="text-left p-4 font-medium">Messages</th>
                  <th className="text-left p-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr key="loading">
                    <td colSpan={7} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading orders...</div>
                    </td>
                  </tr>
                ) : paginatedOrders.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={7} className="text-center py-8">
                      <div className="text-muted-foreground">No orders found</div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order: any) => (
                    <tr key={order._id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{order.number}</span>
                        </div>
                      </td>
                      <td className="p-4">{order.country || "N/A"}</td>
                      <td className="p-4">{order.service || "N/A"}</td>
                      <td className="p-4">{getStatusBadge(order)}</td>
                      <td className="p-4">
                        <Badge variant={order.isused ? "default" : "secondary"}>
                          {order.isused ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {order.message?.length || 0}/{order.maxmessage || 0}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {order.createdAt ? formatDistanceToNow(new Date(order.createdAt), { addSuffix: true }) : "Unknown"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && filteredOrders.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {Math.min(filteredOrders.length, (currentPage - 1) * itemsPerPage + 1)}-
            {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of{" "}
            {filteredOrders.length} orders
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
