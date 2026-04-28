"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { ArrowLeft, RefreshCw, XCircle, Download, Search, Send, Clock, CheckCircle2, AlertCircle } from "lucide-react"
import { getStatusColor, getMessageStatusColor } from "@/lib/bulk-sms-utils"

export default function CampaignDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.campaignId as string
  const trpc = useTRPC()
  const [searchTerm, setSearchTerm] = useState("")

  // Query campaign status
  const { data: campaignData, isLoading, refetch } = useQuery({
    ...trpc.bulkSms.getCampaignStatus.queryOptions({ campaignId }),
    refetchOnWindowFocus: false,
    enabled: !!campaignId,
  })

  const campaign = campaignData?.campaign
  const stats = campaignData?.stats
  const messages = campaignData?.recentMessages || []

  // Cancel campaign mutation
  const cancelCampaignMutation = useMutation({
    ...trpc.bulkSms.cancelCampaign.mutationOptions(),
    onSuccess: () => {
      toast.success("Campaign cancelled")
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to cancel: ${error.message}`)
    }
  })

  // Auto-refresh for active campaigns
  useEffect(() => {
    if (campaign?.status === 'processing' || campaign?.status === 'pending') {
      const interval = setInterval(() => {
        refetch()
      }, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [campaign?.status, refetch])

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel this campaign?')) {
      cancelCampaignMutation.mutate({ campaignId })
    }
  }

  const handleExport = () => {
    if (!messages || messages.length === 0) {
      toast.error('No messages to export')
      return
    }

    const headers = ['Recipient', 'Status', 'Device', 'Sent At', 'Delivered At', 'Failed At', 'Failure Reason']
    const rows = messages.map((msg: any) => [
      msg.recipientNumber,
      msg.status,
      msg.deviceId || 'N/A',
      msg.sentAt ? new Date(msg.sentAt).toISOString() : 'N/A',
      msg.deliveredAt ? new Date(msg.deliveredAt).toISOString() : 'N/A',
      msg.failedAt ? new Date(msg.failedAt).toISOString() : 'N/A',
      msg.failureReason || 'N/A',
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell || ''}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-${campaignId}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast.success('Campaign exported to CSV')
  }

  const filteredMessages = messages?.filter((msg: any) =>
    msg.recipientNumber?.includes(searchTerm) ||
    msg.deviceId?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'sent':
        return <Send className="h-4 w-4 text-blue-500" />
      case 'queued':
        return <Clock className="h-4 w-4 text-purple-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString()
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 bg-muted animate-pulse rounded w-48" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    )
  }

  const progress = (stats?.totalRecipients ?? 0) > 0
    ? Math.min(((stats?.sentCount || 0) / (stats?.totalRecipients ?? 1)) * 100, 100)
    : 0

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <p className="text-muted-foreground text-sm">
              Created {new Date(campaign.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(campaign.status)}>
            {campaign.status}
          </Badge>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {(campaign.status === 'pending' || campaign.status === 'processing') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={cancelCampaignMutation.isPending}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecipients?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.sentCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.deliveredCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failedCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.pendingCount || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Campaign Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {stats?.sentCount || 0} of {stats?.totalRecipients || 0} messages sent
              </span>
              <span className="font-medium">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Info */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Strategy:</span>
              <span className="font-medium capitalize">{campaign?.strategy || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scheduled At:</span>
              <span className="font-medium">{campaign?.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : 'Immediate'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started At:</span>
              <span className="font-medium">{campaign?.startedAt ? new Date(campaign.startedAt).toLocaleString() : 'Not started'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed At:</span>
              <span className="font-medium">{campaign?.completedAt ? new Date(campaign.completedAt).toLocaleString() : 'In progress'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Messages</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by number or device..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <CardDescription>
            Showing {filteredMessages.length} of {messages?.length || 0} recent messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredMessages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No messages match your search' : 'No messages yet'}
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead>Delivered At</TableHead>
                    <TableHead>Failed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMessages.map((msg: any) => (
                    <TableRow key={msg.id}>
                      <TableCell className="font-mono text-sm">{msg.recipientNumber}</TableCell>
                      <TableCell>
                        <Badge className={getMessageStatusColor(msg.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(msg.status)}
                            {msg.status}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {msg.deviceId ? msg.deviceId.slice(0, 8) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(msg.sentAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(msg.deliveredAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(msg.failedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
