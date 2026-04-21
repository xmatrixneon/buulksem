"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/lib/trpc/client"
import { formatDistanceToNow } from "date-fns"
import { Trash2, Mail, User, Clock, Search, MessageSquare, RefreshCw, Inbox, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

interface Message {
  id: string
  sender: string
  receiver: string
  message: string
  port?: string
  createdAt: Date
}

export default function MessagesGridWithTRPC() {
  const trpc = useTRPC()

  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const itemsPerPage = 9

  // tRPC query for fetching messages
  const {
    data: messages = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.messages.list.queryOptions({
      limit: 100,
      offset: 0,
    }),
    refetchOnWindowFocus: false,
  })

  // Delete mutation
  const deleteMutation = useMutation({
    ...trpc.messages.delete.mutationOptions(),
    onSuccess: () => {
      console.log('[Messages] Delete mutation succeeded')
      toast.success("Message deleted successfully")
      refetch()
      setDeleteDialogOpen(false)
      setMessageToDelete(null)
    },
    onError: (error: any) => {
      console.error('[Messages] Delete mutation failed:', error)
      toast.error(`Failed to delete message: ${error.message}`)
    },
  })

  const openDeleteDialog = (id: string) => {
    console.log('[Messages] Opening delete dialog for message:', id)
    setMessageToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    console.log('[Messages] Handle delete called for message:', messageToDelete)
    if (!messageToDelete) return
    await deleteMutation.mutateAsync({ id: messageToDelete })
  }

  const handleCopy = async (message: string, id: string) => {
    console.log('[Messages] Copying message:', id)
    try {
      await navigator.clipboard.writeText(message)
      setCopiedMessageId(id)
      setTimeout(() => setCopiedMessageId(null), 2000)
    } catch (err) {
      console.error('[Messages] Failed to copy text:', err)
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = message
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopiedMessageId(id)
      setTimeout(() => setCopiedMessageId(null), 2000)
    }
  }

  // Filter messages
  const filteredMessages = messages.filter((m: any) =>
    m.sender.toLowerCase().includes(search.toLowerCase()) ||
    m.message.toLowerCase().includes(search.toLowerCase()) ||
    m.receiver.toLowerCase().includes(search.toLowerCase())
  )

  // Pagination
  const totalPages = Math.ceil(filteredMessages.length / itemsPerPage)
  const paginatedMessages = filteredMessages.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Messages
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            View and manage received SMS messages
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search messages..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
          className="pl-10"
        />
      </div>

      {/* Messages Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : paginatedMessages.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No messages found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedMessages.map((msg: any) => (
              <Card key={msg.id} className="relative group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{msg.sender}</p>
                        <p className="text-xs text-muted-foreground truncate">{msg.receiver}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0">
                      {msg.port || "N/A"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    <Clock className="h-3 w-3" />
                    {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true }) : "Unknown"}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm break-words mb-4 line-clamp-4">{msg.message}</p>
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(msg.message, msg.id)}
                      className="flex-1"
                    >
                      {copiedMessageId === msg.id ? (
                        <>✓ Copied</>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(msg.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min(filteredMessages.length, (currentPage - 1) * itemsPerPage + 1)}-
                {Math.min(currentPage * itemsPerPage, filteredMessages.length)} of{" "}
                {filteredMessages.length} messages
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
