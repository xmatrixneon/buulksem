"use client"

import type React from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ActivationActionChart } from "@/components/dashboard-chat"
import { TodaySuccessChart } from "@/components/bar-chart"
import { useTRPC } from "@/lib/trpc/client"
import { Users, Activity, Building, Zap, Clock, RefreshCw, BarChart3 } from "lucide-react"

export default function DashboardContent() {
  const trpc = useTRPC()

  const { data: activationData, isLoading, refetch } = useQuery({
    ...trpc.overview.activation.queryOptions(),
    refetchOnWindowFocus: false,
  })

  // Convert lastSync to IST with AM/PM
  const formatIST = (dateValue: string | Date | null | undefined) => {
    if (!dateValue) return "Never"
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
    if (isNaN(date.getTime())) return "Invalid Date"
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  // Check if lastSync is older than 1 minute
  const isStale = (dateValue: string | Date | null | undefined) => {
    if (!dateValue) return true
    const last = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
    if (isNaN(last.getTime())) return true
    return Date.now() - last.getTime() > 60 * 1000 // 1 min
  }

  return (
    <div className="flex flex-col gap-6 p-2 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Dashboard Overview
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Monitor your SMS activation system performance
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Last Sync Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5" />
              <span className="font-medium">Last Device Sync:</span>
              <Badge variant={isStale(activationData?.lastDeviceSync) ? "destructive" : "default"} className="text-sm">
                {formatIST(activationData?.lastDeviceSync)}
                {isStale(activationData?.lastDeviceSync) && " (Stale)"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5" />
              <span className="font-medium">Last OTP Fetch:</span>
              <Badge variant={isStale(activationData?.lastOtpFetch) ? "destructive" : "default"} className="text-sm">
                {formatIST(activationData?.lastOtpFetch)}
                {isStale(activationData?.lastOtpFetch) && " (Stale)"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-14">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-3 text-lg text-muted-foreground">Loading dashboard data...</span>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Total Numbers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold flex items-center gap-2">
                  {activationData?.totalNumbers ?? "-"}
                </div>
                <p className="text-xs text-muted-foreground">Total registered numbers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Active Numbers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{activationData?.activeNumbers ?? "-"}</div>
                <p className="text-xs text-muted-foreground">Numbers available for use</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Suspended
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{activationData?.suspendedNumbers ?? "-"}</div>
                <p className="text-xs text-muted-foreground">Numbers suspended for quality</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Today's Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{activationData?.todayOrders ?? "-"}</div>
                <p className="text-xs text-muted-foreground">Orders created today</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Order Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActivationActionChart />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Today's Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TodaySuccessChart />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
