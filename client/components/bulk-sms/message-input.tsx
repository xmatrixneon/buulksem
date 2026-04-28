"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { getMessageSegments, calculateCostSegments } from "@/lib/bulk-sms-utils"
import { AlertCircle, Info } from "lucide-react"

interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  recipientCount?: number
  maxLength?: number
  error?: string
}

export function MessageInput({
  value,
  onChange,
  recipientCount = 0,
  maxLength = 1600,
  error
}: MessageInputProps) {
  const [showPreview, setShowPreview] = useState(false)

  const stats = getMessageSegments(value || "")
  const costSegments = recipientCount > 0 ? calculateCostSegments(value || "", recipientCount) : 0

  // Determine color based on segments
  const getSegmentColor = () => {
    if (stats.segments === 1) return "text-green-500"
    if (stats.segments <= 5) return "text-yellow-500"
    return "text-orange-500"
  }

  const getProgressColor = () => {
    const maxSegments = 10
    const percentage = (stats.segments / maxSegments) * 100
    if (percentage < 30) return "bg-green-500"
    if (percentage < 70) return "bg-yellow-500"
    return "bg-red-500"
  }

  const isNearLimit = stats.segments >= 9

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="message">Message</Label>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Info className="h-3 w-3" />
          {showPreview ? "Hide" : "Show"} info
        </button>
      </div>

      <Textarea
        id="message"
        value={value}
        onChange={(e) => {
          const newValue = e.target.value
          if (newValue.length <= maxLength) {
            onChange(newValue)
          }
        }}
        placeholder="Enter your message here...

Example: Hello {name}, your order {order_id} is ready for pickup!"
        rows={6}
        className="font-mono text-sm resize-none"
      />

      {/* Info Panel */}
      {showPreview && (
        <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
          <p className="font-medium">Encoding Information</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Encoding Type:</span>
              <span className={`ml-1 font-medium ${stats.encoding === 'UCS-2' ? 'text-orange-500' : 'text-green-500'}`}>
                {stats.encoding}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Chars/Segment:</span>
              <span className="ml-1 font-medium">{stats.charsPerSegment}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.encoding === 'UCS-2'
              ? "Using Unicode encoding for emojis or special characters. Messages are limited to 70 chars each."
              : "Using standard GSM-7 encoding. Messages are limited to 160 chars each."
            }
          </p>
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {stats.totalChars}/{maxLength} chars
          </span>
          <span className={`font-medium ${getSegmentColor()}`}>
            {stats.segments}/10 segments
          </span>
          <span className="text-muted-foreground">
            {stats.encoding}
          </span>
        </div>

        {recipientCount > 0 && (
          <span className="text-muted-foreground">
            Cost: {costSegments.toLocaleString()} seg
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getProgressColor()} transition-all duration-200`}
          style={{ width: `${Math.min((stats.segments / 10) * 100, 100)}%` }}
        />
      </div>

      {/* Warning */}
      {isNearLimit && (
        <div className="flex items-center gap-2 text-xs text-orange-500">
          <AlertCircle className="h-3 w-3" />
          <span>Approaching maximum message length (10 segments)</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
