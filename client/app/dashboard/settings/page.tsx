"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Key, Copy, RefreshCw, Eye, EyeOff, Shield } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function SettingsPage() {
  const trpc = useTRPC()
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)

  // Query to get API key
  const { data: apiKeyData, isLoading, refetch } = useQuery({
    ...trpc.getApiKey.queryOptions(),
    refetchOnWindowFocus: false,
  })

  // Query to get user profile
  const { data: userData, isLoading: userLoading } = useQuery({
    ...trpc.me.queryOptions(),
    refetchOnWindowFocus: false,
  })

  // Mutation to regenerate API key
  const regenerateMutation = useMutation({
    ...trpc.regenerateApiKey.mutationOptions(),
    onSuccess: (data) => {
      toast.success("API key regenerated successfully")
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to regenerate: ${error.message}`)
    }
  })

  const handleCopy = () => {
    if (apiKeyData?.apiKey) {
      navigator.clipboard.writeText(apiKeyData.apiKey)
      setCopied(true)
      toast.success("API key copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRegenerate = () => {
    regenerateMutation.mutate()
  }

  const apiKey = apiKeyData?.apiKey
  const displayApiKey = showApiKey ? apiKey : apiKey?.replace(/./g, '•') || '••••••••••••••••••••••••••••••••'

  const user = userData?.user
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Unknown'

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and API access</p>
      </div>

      {/* API Key Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>API Key</CardTitle>
          </div>
          <CardDescription>
            Your API key is used to authenticate requests to the stubs API. Keep it secure and don't share it with others.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-10 w-full bg-muted animate-pulse rounded" />
              <div className="h-10 w-32 bg-muted animate-pulse rounded" />
            </div>
          ) : apiKey ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">Your API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    value={displayApiKey || ''}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "Hide" : "Show"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    disabled={copied}
                    title="Copy to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={regenerateMutation.isPending}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                      Regenerate API Key
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will invalidate your current API key. Any applications using the old key will stop working.
                        You'll need to update them with the new key. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRegenerate}>
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium">How to use your API key:</p>
                <code className="block bg-background p-2 rounded text-xs overflow-x-auto">
                  https://syncmesh-datacore.shop/stubs/handler_api.php?action=getNumber&api_key={showApiKey ? apiKey : 'YOUR_API_KEY'}&service=telegram&country=22
                </code>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No API key found. Generate one to get started.</p>
              <Button onClick={handleRegenerate} disabled={regenerateMutation.isPending}>
                <RefreshCw className={`h-4 w-4 mr-2 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                Generate API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Info Section */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your account details and information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userLoading ? (
            <div className="space-y-2">
              <div className="h-6 w-40 bg-muted animate-pulse rounded" />
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{user?.email || 'Not available'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Member Since</Label>
                <p className="font-medium">{memberSince}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
