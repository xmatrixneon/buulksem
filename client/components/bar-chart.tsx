"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Cell,
  ResponsiveContainer,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"

interface TodayChartData {
  hour: string
  success: number
  canceled: number
  total: number
}

export function TodaySuccessChart() {
  const trpc = useTRPC()

  const { data: hourlyData = [], isLoading } = useQuery({
    ...trpc.overview.today.queryOptions(),
    refetchOnWindowFocus: false,
  })

  const [chartData, setChartData] = useState<TodayChartData[]>([])
  const [successRate, setSuccessRate] = useState(0)
  const [peakHour, setPeakHour] = useState<number | null>(null)

  useEffect(() => {
    const transformedData: TodayChartData[] = hourlyData.map(item => ({
      hour: item.hour,
      success: item.success || 0,
      canceled: item.canceled || 0,
      total: item.total || 0
    }))

    setChartData(transformedData)

    // Calculate success rate
    const totalOrders = transformedData.reduce((sum, d) => sum + d.total, 0)
    const successOrders = transformedData.reduce((sum, d) => sum + d.success, 0)

    if (totalOrders > 0) {
      setSuccessRate(Math.round((successOrders / totalOrders) * 100))
    }

    // Find peak hour (based on total orders)
    const maxOrders = Math.max(...transformedData.map(d => d.total))
    const peakHourData = transformedData.find(d => d.total === maxOrders)
    if (peakHourData && peakHourData.hour) {
      setPeakHour(parseInt(peakHourData.hour.split(':')[0] || '0'))
    }
  }, [hourlyData])

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Today's Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                Success Rate: <span className="font-bold text-green-600">{successRate}%</span>
              </div>
              {peakHour !== null && (
                <div className="text-sm text-muted-foreground">
                  Peak Hour: <span className="font-bold">{peakHour.toString().padStart(2, '0')}:00</span>
                </div>
              )}
            </div>
            <ChartContainer
              config={{
                success: {
                  label: "Success",
                  theme: {
                    light: "oklch(0.647 0.206 150.7)",
                    dark: "oklch(0.647 0.206 150.7)",
                  },
                },
                canceled: {
                  label: "Canceled",
                  theme: {
                    light: "oklch(0.627 0.265 25.3)",
                    dark: "oklch(0.627 0.265 25.3)",
                  },
                },
              }}
              className="h-[300px] w-full"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar
                    dataKey="success"
                    fill="var(--color-success)"
                    name="Success"
                    radius={[8, 8, 0, 0]}
                  >
                    {chartData.map((entry, index) => {
                      const hourValue = entry.hour?.split(':')[0]
                      const isPeak = peakHour !== null && hourValue !== undefined && parseInt(hourValue) === peakHour
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isPeak ? "var(--color-success)" : "var(--color-success) / 0.7"}
                        />
                      )
                    })}
                  </Bar>
                  <Bar
                    dataKey="canceled"
                    fill="var(--color-canceled)"
                    name="Canceled"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
