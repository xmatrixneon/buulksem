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
  totalSuccessOrders: number
  totalUnsuccessOrders: number
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
    // Transform data to include success/unsucess breakdown
    const transformedData: TodayChartData[] = hourlyData.map(item => ({
      hour: item.hour,
      totalSuccessOrders: item.count,
      totalUnsuccessOrders: 0, // Not tracked in current data
    }))

    setChartData(transformedData)

    // Calculate success rate
    const totalOrders = transformedData.reduce((sum, d) => sum + d.totalSuccessOrders, 0)
    const successOrders = transformedData.reduce((sum, d) => sum + d.totalSuccessOrders, 0)

    if (totalOrders > 0) {
      setSuccessRate(Math.round((successOrders / totalOrders) * 100))
    }

    // Find peak hour
    const maxOrders = Math.max(...transformedData.map(d => d.totalSuccessOrders))
    const peakHourData = transformedData.find(d => d.totalSuccessOrders === maxOrders)
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
                totalSuccessOrders: {
                  label: "Orders",
                  theme: {
                    light: "oklch(0.5583 0.1276 42.9956)",
                    dark: "oklch(0.5583 0.1276 42.9956)",
                  },
                },
              }}
              className="h-[300px] w-full"
            >
              <BarChart data={chartData} width={639} height={300}>
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
                  dataKey="totalSuccessOrders"
                  fill="var(--color-totalSuccessOrders)"
                  name="Orders"
                  radius={[8, 8, 0, 0]}
                >
                  {chartData.map((entry, index) => {
                    const hourValue = entry.hour?.split(':')[0]
                    const isPeak = peakHour !== null && hourValue !== undefined && parseInt(hourValue) === peakHour
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isPeak ? "var(--color-totalSuccessOrders)" : "var(--color-totalSuccessOrders) / 0.7"}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
