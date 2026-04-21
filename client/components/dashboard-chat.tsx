"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"

interface ChartData {
  date: string
  activation: number
  action: number
  cancel: number
}

interface ApiChartData {
  date: string
  count: number
}

export function ActivationActionChart() {
  const trpc = useTRPC()

  const { data: apiChartData = [], isLoading } = useQuery({
    ...trpc.overview.chart.queryOptions({ days: 7 }),
    refetchOnWindowFocus: false,
  })

  const chartData = useMemo(() => {
    try {
      return apiChartData.map(item => ({
        date: item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
        activation: item.count || 0,
        action: 0, // Not available in current data
        cancel: 0 // Not available in current data
      }))
    } catch (error) {
      console.error('Error transforming chart data:', error)
      return []
    }
  }, [apiChartData])

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Order Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : (
          <ChartContainer
            config={{
              activation: {
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
                dataKey="date"
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
                dataKey="activation"
                fill="var(--color-activation)"
                name="Orders"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
