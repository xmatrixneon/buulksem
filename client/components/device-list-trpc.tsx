'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Smartphone, Search, Wifi, WifiOff, PhoneForwarded, PhoneOff, Send, Power,
} from 'lucide-react'
import { toast } from 'sonner'

// Types for the device data from tRPC
interface Device {
  id: string
  deviceId: string
  name: string
  status: 'online' | 'offline' | 'error'
  lastSeen: Date
  lastHeartbeat: Date
  batteryLevel?: number
  isCharging: boolean
  signalStrength: number
  networkType: string
  sims?: any[]
  timeSinceLastSeen?: {
    minutes: number
    hours: number
    days: number
  }
}

interface DeviceStats {
  total: number
  online: number
  offline: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deviceMatchesFilters(device: Device, searchTerm: string, statusFilter: string): boolean {
  // Check status filter
  if (statusFilter && statusFilter !== 'all' && device.status !== statusFilter) {
    return false
  }
  // Check search term
  if (searchTerm && searchTerm.trim()) {
    const search = searchTerm.toLowerCase()
    return (
      device.name?.toLowerCase().includes(search) ||
      device.deviceId?.toLowerCase().includes(search)
    )
  }
  return true
}

function computeTimeSince(lastSeen: Date) {
  const diffMs   = Date.now() - new Date(lastSeen).getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHrs  = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)
  return {
    minutes: diffMins % 60,
    hours:   diffHrs  % 24,
    days:    diffDays,
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="px-4 py-3 pb-1.5"><Skeleton className="h-3.5 w-20" /></CardHeader>
            <CardContent className="px-4 pb-3"><Skeleton className="h-7 w-14" /></CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="px-4 pt-4 pb-3"><Skeleton className="h-5 w-28" /></CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeviceListWithTRPC() {
  const trpc = useTRPC()

  // Local state
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'online' | 'offline' | 'all'>('all')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  // tRPC queries
  const {
    data: devices = [],
    isLoading: devicesLoading,
    error: devicesError,
    refetch: refetchDevices
  } = useQuery(
    trpc.device.list.queryOptions({
      status: statusFilter,
      limit: 50,
      offset: 0
    })
  )

  // WebSocket for real-time updates
  const wsRef = useRef<WebSocket | null>(null)
  const refetchDevicesRef = useRef(refetchDevices)

  // Keep the ref updated
  useEffect(() => {
    refetchDevicesRef.current = refetchDevices
  }, [refetchDevices])

  // Stable refetch callback that never changes
  const stableRefetch = useCallback(() => {
    refetchDevicesRef.current()
  }, [])

  // Fetch devices on mount and when status filter changes
  useEffect(() => {
    stableRefetch()
  }, [statusFilter, stableRefetch])

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (typeof window === 'undefined') return

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000'
    const wsProtocol = serverUrl.startsWith('https') ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${new URL(serverUrl).host}/gateway?client=dashboard`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          switch (msg.type) {
            case 'device_status':
            case 'device_heartbeat':
            case 'device_online':
            case 'device_offline':
              stableRefetch()
              break
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
      }

      return () => {
        ws.close()
      }
    } catch (error) {
      console.error('Error creating WebSocket connection:', error)
    }
  }, [stableRefetch])

  // Filter devices based on search term
  const filteredDevices = devices.filter(device =>
    deviceMatchesFilters(device as Device, searchTerm, statusFilter)
  )

  // Compute stats
  const stats: DeviceStats = {
    total: devices.length,
    online: devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
  }

  // Mutations
  const sendSmsMutation = useMutation({
    ...trpc.device.sendSms.mutationOptions(),
    onSuccess: () => {
      toast.success('SMS sent successfully')
    },
    onError: (error) => {
      toast.error(`Failed to send SMS: ${error.message}`)
    }
  })

  const toggleCallForwardingMutation = useMutation({
    ...trpc.device.toggleCallForwarding.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Call forwarding ${data.action} successful`)
      stableRefetch()
    },
    onError: (error) => {
      toast.error(`Failed to toggle call forwarding: ${error.message}`)
    }
  })

  if (devicesLoading) {
    return <LoadingSkeleton />
  }

  if (devicesError) {
    return (
      <div className="p-6 text-center text-red-500">
        <p>Error loading devices. Please try again.</p>
        <Button onClick={stableRefetch} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-3">
        <Card>
          <CardHeader className="px-4 py-3 pb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Total Devices</span>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-4 py-3 pb-1.5">
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Online</span>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.online}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-4 py-3 pb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Offline</span>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold">{stats.offline}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Device Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDevices.map((device) => {
          const d = device as Device
          return (
            <Card key={d.deviceId} className="hover:shadow-md transition-shadow">
              <CardHeader className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base truncate">{d.name}</CardTitle>
                  <div className={`flex items-center gap-1.5 text-xs ${
                    d.status === 'online' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    {d.status === 'online' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    <span className="capitalize">{d.status}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <p className="text-xs text-muted-foreground truncate">ID: {d.deviceId}</p>
                <div className="flex items-center gap-2 text-xs">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{d.batteryLevel != null ? `${d.batteryLevel}%` : 'N/A'}</span>
                  {d.isCharging && <span className="text-green-600">⚡</span>}
                  <span className="text-muted-foreground">•</span>
                  <span>Signal: {d.signalStrength}/4</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    d.networkType === 'wifi' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                    d.networkType === 'mobile' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {d.networkType || 'Unknown'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredDevices.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No devices found</p>
        </div>
      )}
    </div>
  )
}
