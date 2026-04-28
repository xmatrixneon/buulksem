/**
 * Bulk SMS Utility Functions
 *
 * Phone number validation, message encoding detection, and recipient parsing
 */

// GSM-7 basic character set (default alphabet)
const GSM_7_BASIC = '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

// GSM-7 extended character set (requires escape, counts as 2 chars)
const GSM_7_EXTENDED = '^{}\\[~]|€'

/**
 * Check if a character is GSM-7 compatible
 */
function isGsm7Char(char: string): boolean {
  if (GSM_7_BASIC.includes(char)) return true
  if (GSM_7_EXTENDED.includes(char)) return true
  if (char.charCodeAt(0) === 0x1B) return true
  return false
}

/**
 * Check if message requires UCS-2 encoding
 */
export function requiresUcs2Encoding(message: string): boolean {
  for (const char of message) {
    if (!isGsm7Char(char)) {
      return true
    }
  }
  return false
}

/**
 * Get message segment information
 */
export function getMessageSegments(message: string): {
  encoding: 'GSM-7' | 'UCS-2'
  segmentLength: number
  segments: number
  charsPerSegment: number
  totalChars: number
  remainingChars: number
} {
  const isUcs2 = requiresUcs2Encoding(message)
  const totalChars = message.length

  if (isUcs2) {
    const charsPerSegment = totalChars > 70 ? 67 : 70
    const segments = Math.ceil(totalChars / charsPerSegment)
    const remaining = segments * charsPerSegment - totalChars

    return {
      encoding: 'UCS-2',
      segmentLength: charsPerSegment,
      segments,
      charsPerSegment,
      totalChars,
      remainingChars: remaining
    }
  } else {
    const charsPerSegment = totalChars > 160 ? 153 : 160
    const segments = Math.ceil(totalChars / charsPerSegment)
    const remaining = segments * charsPerSegment - totalChars

    return {
      encoding: 'GSM-7',
      segmentLength: charsPerSegment,
      segments,
      charsPerSegment,
      totalChars,
      remainingChars: remaining
    }
  }
}

/**
 * Validate phone number
 * - Must be at least 10 characters
 * - Can start with +
 * - Can contain digits, spaces, dashes, parentheses
 */
export function validatePhoneNumber(number: string): boolean {
  const cleaned = number.trim()
  if (cleaned.length < 10) return false

  // Allow digits, +, spaces, dashes, parentheses
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/
  return phoneRegex.test(cleaned)
}

/**
 * Parse recipients from text
 * Supports CSV, line-separated, and mixed formats
 */
export function parseRecipients(text: string): {
  valid: string[]
  invalid: string[]
  duplicates: number
} {
  const numbers: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  // Split by comma, newline, or both
  const rawItems = text.split(/[\n,\r]+/).filter(s => s.trim())

  for (const item of rawItems) {
    const cleaned = item.trim()
    if (!cleaned) continue

    if (validatePhoneNumber(cleaned)) {
      // Normalize for duplicate checking
      const normalized = cleaned.replace(/[^\d+]/g, '')
      if (seen.has(normalized)) {
        // Count as duplicate but don't add again
        continue
      }
      seen.add(normalized)
      numbers.push(cleaned)
    } else {
      invalid.push(cleaned)
    }
  }

  // Calculate duplicates (raw items - unique valid - invalid)
  const duplicates = rawItems.length - numbers.length - invalid.length

  return { valid: numbers, invalid, duplicates }
}

/**
 * Format phone number for display
 * Keeps the original format but ensures consistent display
 */
export function formatPhoneNumber(number: string): string {
  return number.trim()
}

/**
 * Calculate total cost segments for bulk campaign
 */
export function calculateCostSegments(message: string, recipientCount: number): number {
  const info = getMessageSegments(message)
  return info.segments * recipientCount
}

/**
 * Get campaign status badge color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/10 text-green-500 border-green-500/20'
    case 'processing':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'failed':
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'cancelled':
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    case 'pending':
    default:
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
  }
}

/**
 * Get message status badge color
 */
export function getMessageStatusColor(status: string): string {
  switch (status) {
    case 'delivered':
      return 'bg-green-500/10 text-green-500 border-green-500/20'
    case 'sent':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    case 'queued':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    case 'failed':
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    case 'pending':
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
  }
}
