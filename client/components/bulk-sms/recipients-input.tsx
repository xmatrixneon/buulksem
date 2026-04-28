"use client"

import { useState, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { parseRecipients } from "@/lib/bulk-sms-utils"
import { Upload, X, AlertCircle, CheckCircle2, Users } from "lucide-react"

interface RecipientsInputProps {
  value: string
  onChange: (value: string, validNumbers: string[]) => void
  error?: string
}

export function RecipientsInput({ value, onChange, error }: RecipientsInputProps) {
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parsed = parseRecipients(value || "")
  const { valid, invalid, duplicates } = parsed

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      // Append to existing value
      const newValue = value ? `${value}\n${content}` : content
      onChange(newValue, parseRecipients(newValue).valid)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    const file = files.find(f => f.type === "text/csv" || f.type === "text/plain" || f.name.endsWith('.csv') || f.name.endsWith('.txt'))

    if (file) {
      handleFileUpload(file)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const clearAll = () => {
    onChange("", [])
  }

  const removeInvalid = () => {
    const validOnly = valid.join(", ")
    onChange(validOnly, valid)
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="recipients">Recipients</Label>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="space-y-2">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop CSV/TXT file here or{" "}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-primary hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            Supports comma-separated or line-separated phone numbers
          </p>
        </div>
      </div>

      {/* Textarea */}
      <Textarea
        id="recipients"
        value={value}
        onChange={(e) => onChange(e.target.value, parseRecipients(e.target.value).valid)}
        placeholder="Enter phone numbers...

Format examples:
• CSV: +1234567890,+9876543210,...
• Line-separated: +1234567890 (one per line)
• Mixed: Both formats work"
        rows={6}
        className="font-mono text-sm resize-none"
      />

      {/* Stats Card */}
      {value && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {valid.length} valid number{valid.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {duplicates > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {duplicates} duplicate{duplicates !== 1 ? "s" : ""}
                  </span>
                )}

                {invalid.length > 0 && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {invalid.length} invalid
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {invalid.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeInvalid}
                      className="h-7 text-xs"
                    >
                      Remove Invalid
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              </div>
            </div>

            {/* Invalid Numbers Preview */}
            {invalid.length > 0 && invalid.length <= 5 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-1">Invalid numbers:</p>
                <div className="flex flex-wrap gap-1">
                  {invalid.map((num, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded text-xs"
                    >
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {invalid.length > 5 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  First 5 invalid numbers: {invalid.slice(0, 5).join(", ")}
                  {invalid.length > 5 && "..."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Valid Indicator */}
      {valid.length > 0 && invalid.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <CheckCircle2 className="h-3 w-3" />
          <span>All numbers are valid</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  )
}
