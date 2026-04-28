"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Smartphone, Wifi, WifiOff, Battery, Signal, Check, Filter } from "lucide-react"

interface DevicePoolSelectorProps {
  selectedDevices: string[]
  onChange: (deviceIds: string[]) => void
  onlineOnly?: boolean
}

interface Device {
  id: string
  deviceId: string
  name: string
  status: 'online' | 'offline'
  lastSeen: Date
  batteryLevel?: number
  isCharging: boolean
  signalStrength: number
  networkType: string
  sims?: any[]
  dailySmsSent?: number
  dailySmsLimit?: number
}

export function DevicePoolSelector({
  selectedDevices,
  onChange,
  onlineOnly = false
}: DevicePoolSelectorProps) {
  const trpc = useTRPC()
  const [showOnlineOnly, setShowOnlineOnly] = useState(onlineOnly)

  const { data: devices = [], isLoading } = useQuery({
    ...trpc.device.list.queryOptions({
      status: showOnlineOnly ? 'online' : 'all',
      limit: 50,
      offset: 0
    }),
    refetchOnWindowFocus: false,
  })

  const filteredDevices = showOnlineOnly
    ? devices.filter((d: any) => d.status === 'online')
    : devices

  const allSelected = filteredDevices.length > 0 &&
    filteredDevices.every((d: any) => selectedDevices.includes(d.deviceId))

  const toggleDevice = (deviceId: string) => {
    if (selectedDevices.includes(deviceId)) {
      onChange(selectedDevices.filter(id => id !== deviceId))
    } else {
      onChange([...selectedDevices, deviceId])
    }
  }

  const toggleAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(filteredDevices.map((d: any) => d.deviceId))
    }
  }

  const totalCapacity = filteredDevices.reduce((sum: number, d: any) => {
    const remaining = (d.dailySmsLimit || 100) - (d.dailySmsSent || 0)
    return sum + Math.max(0, remaining)
  }, 0)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>Device Pool</Label>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Device Pool</Label>
        <div className="flex items-center gap-2">
          {selectedDevices.length > 0 && (
            <Badge variant="secondary">
              {selectedDevices.length} selected
            </Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOnlineOnly(!showOnlineOnly)}
            className="h-7 text-xs"
          >
            <Filter className="h-3 w-3 mr-1" />
            {showOnlineOnly ? "All Devices" : "Online Only"}
          </Button>
        </div>
      </div>

      {/* Select All / Clear */}
      {filteredDevices.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all-devices"
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <label
            htmlFor="select-all-devices"
            className="text-sm cursor-pointer select-none"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </label>
        </div>
      )}

      {/* Device List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filteredDevices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No devices available</p>
          </div>
        ) : (
          filteredDevices.map((device: any) => {
            const isSelected = selectedDevices.includes(device.deviceId)
            const remaining = (device.dailySmsLimit || 100) - (device.dailySmsSent || 0)

            return (
              <Card
                key={device.deviceId}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
                onClick={() => toggleDevice(device.deviceId)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleDevice(device.deviceId)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {device.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            device.status === 'online'
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                          }`}
                        >
                          {device.status === 'online' ? (
                            <>
                              <Wifi className="h-2.5 w-2.5 mr-1" />
                              Online
                            </>
                          ) : (
                            <>
                              <WifiOff className="h-2.5 w-2.5 mr-1" />
                              Offline
                            </>
                          )}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Battery className="h-3 w-3" />
                          <span>{device.batteryLevel ?? 0}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Signal className="h-3 w-3" />
                          <span>{device.signalStrength}/4</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          <span>{device.networkType || 'Unknown'}</span>
                        </div>
                      </div>

                      {/* Daily SMS Usage */}
                      {(device.dailySmsSent !== undefined || device.dailySmsLimit !== undefined) && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Daily Usage</span>
                            <span>
                              {device.dailySmsSent ?? 0} / {device.dailySmsLimit ?? 100}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                remaining < 10
                                  ? "bg-red-500"
                                  : remaining < 30
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{
                                width: `${Math.min(
                                  ((device.dailySmsSent ?? 0) / (device.dailySmsLimit ?? 100)) * 100,
                                  100
                                )}%`
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {remaining} remaining
                          </span>
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Total Capacity */}
      {selectedDevices.length > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          Total SMS capacity: {totalCapacity.toLocaleString()} messages
        </div>
      )}
    </div>
  )
}
