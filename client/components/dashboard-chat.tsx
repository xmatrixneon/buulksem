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
  ResponsiveContainer,
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
  success: number
  canceled: number
  total: number
}

interface ApiChartData {
  date: string
  success: number
  canceled: number
  total: number
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
        success: item.success || 0,
        canceled: item.canceled || 0,
        total: item.total || 0
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
                  dataKey="success"
                  fill="var(--color-success)"
                  name="Success"
                  radius={[8, 8, 0, 0]}
                />
                <Bar
                  dataKey="canceled"
                  fill="var(--color-canceled)"
                  name="Canceled"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
