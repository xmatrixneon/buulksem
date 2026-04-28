"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Send, Clock, CheckCircle2, XCircle, X, Eye, EyeOff } from "lucide-react"
import { MessageInput } from "@/components/bulk-sms/message-input"
import { RecipientsInput } from "@/components/bulk-sms/recipients-input"
import { DevicePoolSelector } from "@/components/bulk-sms/device-pool-selector"
import { getStatusColor, parseRecipients } from "@/lib/bulk-sms-utils"

export default function BulkSMSPage() {
  const trpc = useTRPC()
  const router = useRouter()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [showCampaignPreview, setShowCampaignPreview] = useState(false)

  // Form state
  const [campaignName, setCampaignName] = useState("")
  const [message, setMessage] = useState("")
  const [recipients, setRecipients] = useState("")
  const [validRecipients, setValidRecipients] = useState<string[]>([])
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [strategy, setStrategy] = useState<"round-robin" | "load-balanced" | "priority">("round-robin")
  const [simSlot, setSimSlot] = useState<"1" | "2" | "both">("both")

  // Query campaigns
  const { data: campaignsData, isLoading, refetch } = useQuery({
    ...trpc.bulkSms.listCampaigns.queryOptions({
      limit: 20,
      offset: 0
    }),
    refetchOnWindowFocus: false,
  })

  const campaigns = campaignsData?.campaigns || []

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    ...trpc.bulkSms.createCampaign.mutationOptions(),
    onSuccess: (data) => {
      toast.success("Campaign created successfully")
      setIsCreateDialogOpen(false)
      resetForm()
      refetch()
      router.push(`/dashboard/bulk-sms/${data.campaignId}`)
    },
    onError: (error: any) => {
      toast.error(`Failed to create campaign: ${error.message}`)
    }
  })

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

  const resetForm = () => {
    setCampaignName("")
    setMessage("")
    setRecipients("")
    setValidRecipients([])
    setSelectedDevices([])
    setStrategy("round-robin")
    setSimSlot("both")
  }

  const handleCreateCampaign = () => {
    // Validation
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name")
      return
    }
    if (!message.trim()) {
      toast.error("Please enter a message")
      return
    }
    if (validRecipients.length === 0) {
      toast.error("Please add at least one valid recipient")
      return
    }
    if (selectedDevices.length === 0) {
      toast.error("Please select at least one device")
      return
    }

    createCampaignMutation.mutate({
      name: campaignName,
      message,
      recipients: validRecipients,
      devicePool: selectedDevices,
      strategy,
      simSlot: simSlot === "both" ? "both" : parseInt(simSlot),
    })
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bulk SMS Campaigns</h1>
          <p className="text-muted-foreground">Create and manage bulk SMS campaigns</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Bulk SMS Campaign</DialogTitle>
              <DialogDescription>
                Send bulk SMS messages to multiple recipients using your device pool
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Campaign Name */}
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Promo Campaign - April 2026"
                />
              </div>

              {/* Message */}
              <MessageInput
                value={message}
                onChange={setMessage}
                recipientCount={validRecipients.length}
              />

              {/* Recipients */}
              <RecipientsInput
                value={recipients}
                onChange={(value, valid) => {
                  setRecipients(value)
                  setValidRecipients(valid)
                }}
              />

              {/* Device Pool */}
              <DevicePoolSelector
                selectedDevices={selectedDevices}
                onChange={setSelectedDevices}
                onlineOnly={false}
              />

              {/* Strategy */}
              <div className="space-y-2">
                <Label htmlFor="strategy">Distribution Strategy</Label>
                <Select value={strategy} onValueChange={(value: any) => setStrategy(value)}>
                  <SelectTrigger id="strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">Round Robin</SelectItem>
                    <SelectItem value="load-balanced">Load Balanced</SelectItem>
                    <SelectItem value="priority">Priority (First Device)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {strategy === "round-robin" && "Distribute messages evenly across all devices"}
                  {strategy === "load-balanced" && "Send to device with least messages sent"}
                  {strategy === "priority" && "Always use the first device in pool"}
                </p>
              </div>

              {/* SIM Slot */}
              <div className="space-y-2">
                <Label>SIM Slot</Label>
                <Select value={simSlot} onValueChange={(value: any) => setSimSlot(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both SIMs (Auto)</SelectItem>
                    <SelectItem value="1">SIM 1 Only</SelectItem>
                    <SelectItem value="2">SIM 2 Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary */}
              {validRecipients.length > 0 && message && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Campaign Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recipients:</span>
                      <span className="font-medium">{validRecipients.length.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Message segments:</span>
                      <span className="font-medium">
                        {require("@/lib/bulk-sms-utils").getMessageSegments(message).segments}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total segments:</span>
                      <span className="font-medium">
                        {require("@/lib/bulk-sms-utils").calculateCostSegments(message, validRecipients.length).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Devices:</span>
                      <span className="font-medium">{selectedDevices.length}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={createCampaignMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCampaign}
                disabled={createCampaignMutation.isPending || validRecipients.length === 0 || selectedDevices.length === 0}
              >
                {createCampaignMutation.isPending ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Campaign
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaign List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Send className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-4">Create your first bulk SMS campaign to get started</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign: any) => (
            <Card key={campaign.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold truncate">{campaign.name}</h3>
                      <Badge className={getStatusColor(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Recipients</p>
                        <p className="font-medium">{campaign.totalRecipients?.toLocaleString() || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Sent</p>
                        <p className="font-medium text-green-600">{campaign.sentCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Delivered</p>
                        <p className="font-medium text-blue-600">{campaign.deliveredCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Failed</p>
                        <p className="font-medium text-red-600">{campaign.failedCount || 0}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      Created {formatDate(campaign.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/dashboard/bulk-sms/${campaign.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    {(campaign.status === 'pending' || campaign.status === 'processing') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => {
                          if (confirm('Are you sure you want to cancel this campaign?')) {
                            cancelCampaignMutation.mutate({ campaignId: campaign.id })
                          }
                        }}
                        disabled={cancelCampaignMutation.isPending}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {campaign.totalRecipients > 0 && (
                  <div className="mt-4">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            ((campaign.sentCount || 0) / campaign.totalRecipients) * 100,
                            100
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
