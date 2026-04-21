/**
 * SMS Encoding and Character Limit Utilities
 *
 * Implements GSM-7 and UCS-2 encoding detection and message segmentation
 *
 * Standards:
 * - GSM-7 (7-bit): 160 chars (single), 153 chars (multipart with UDH header)
 * - UCS-2/UTF-16 (16-bit): 70 chars (single), 67 chars (multipart with UDH header)
 * - Extended GSM-7 chars: ^ { } \ [ ] ~ | € (count as 2 chars each)
 *
 * @see https://developers.imiconnect.io/reference/sms-length-and-encoding
 */

// GSM-7 basic character set (default alphabet)
const GSM_7_BASIC = '@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

// GSM-7 extended character set (requires escape, counts as 2 chars)
const GSM_7_EXTENDED = '^{}\\[~]|€'

/**
 * Check if a character is GSM-7 compatible
 *
 * @param char - Single character to check
 * @returns true if character is GSM-7 compatible, false if requires UCS-2
 */
function isGsm7Char(char: string): boolean {
  // Basic GSM-7 (7-bit)
  if (GSM_7_BASIC.includes(char)) return true

  // Extended GSM-7 (counts as 2 chars)
  if (GSM_7_EXTENDED.includes(char)) return true

  // Escape sequences
  if (char.charCodeAt(0) === 0x1B) return true // ESC character

  return false
}

/**
 * Check if message requires UCS-2 encoding
 *
 * A message requires UCS-2 encoding if it contains any non-GSM-7 characters
 * (e.g., emojis, Cyrillic, Chinese, Japanese, Arabic, etc.)
 *
 * @param message - Message text to check
 * @returns true if message requires UCS-2 encoding
 *
 * @example
 * requiresUcs2Encoding("Hello World") // false (GSM-7)
 * requiresUcs2Encoding("Hello 👋 World") // true (emoji)
 * requiresUcs2Encoding("Привет мир") // true (Cyrillic)
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
 *
 * Calculates how many SMS segments a message will require based on its encoding
 * and length. Single messages have 160 (GSM-7) or 70 (UCS-2) chars.
 * Multipart messages have 153 (GSM-7) or 67 (UCS-2) chars per segment
 * due to UDH (User Data Header) overhead.
 *
 * @param message - Message text to analyze
 * @returns Object containing encoding, segment count, and character info
 *
 * @example
 * getMessageSegments("Hello World")
 * // { encoding: 'GSM-7', segmentLength: 160, segments: 1, charsPerSegment: 160, totalChars: 11 }
 *
 * getMessageSegments("Hello 👋 World")
 * // { encoding: 'UCS-2', segmentLength: 70, segments: 1, charsPerSegment: 70, totalChars: 13 }
 *
 * getMessageSegments("A".repeat(200))
 * // { encoding: 'GSM-7', segmentLength: 153, segments: 2, charsPerSegment: 153, totalChars: 200 }
 */
export function getMessageSegments(message: string): {
  encoding: 'GSM-7' | 'UCS-2'
  segmentLength: number
  segments: number
  charsPerSegment: number
  totalChars: number
} {
  const isUcs2 = requiresUcs2Encoding(message)
  const totalChars = message.length

  if (isUcs2) {
    // UCS-2 encoding: 70 chars single, 67 chars per multipart segment
    const charsPerSegment = totalChars > 70 ? 67 : 70
    const segments = Math.ceil(totalChars / charsPerSegment)

    return {
      encoding: 'UCS-2',
      segmentLength: charsPerSegment,
      segments,
      charsPerSegment,
      totalChars
    }
  } else {
    // GSM-7 encoding: 160 chars single, 153 chars per multipart segment
    const charsPerSegment = totalChars > 160 ? 153 : 160
    const segments = Math.ceil(totalChars / charsPerSegment)

    return {
      encoding: 'GSM-7',
      segmentLength: charsPerSegment,
      segments,
      charsPerSegment,
      totalChars
    }
  }
}

/**
 * Validate message for SMS sending
 *
 * Checks if message length is within acceptable limits for SMS sending.
 * Most carriers support up to 10 segments (255 technically, but 10 is safe).
 *
 * @param message - Message text to validate
 * @param maxSegments - Maximum allowed segments (default: 10)
 * @returns Validation result with error details if invalid
 *
 * @example
 * validateMessage("Hello World")
 * // { valid: true, segments: 1, encoding: 'GSM-7' }
 *
 * validateMessage("A".repeat(1000))
 * // { valid: false, error: 'Message too long: 7 segments (max 10)...', segments: 7, encoding: 'GSM-7' }
 */
export function validateMessage(message: string, maxSegments: number = 10): {
  valid: boolean
  error?: string
  segments: number
  encoding: 'GSM-7' | 'UCS-2'
} {
  const info = getMessageSegments(message)

  if (info.segments > maxSegments) {
    return {
      valid: false,
      error: `Message too long: ${info.segments} segments (max ${maxSegments}). Current length: ${info.totalChars} chars using ${info.encoding} encoding.`,
      segments: info.segments,
      encoding: info.encoding
    }
  }

  return {
    valid: true,
    segments: info.segments,
    encoding: info.encoding
  }
}

/**
 * Get detailed message info for UI display
 *
 * Provides comprehensive information about a message including encoding type,
 * segment count, remaining characters, and a user-friendly description.
 *
 * @param message - Message text to analyze
 * @returns Detailed message information for UI display
 *
 * @example
 * getMessageInfo("Hello World")
 * // {
 * //   text: "Hello World",
 * //   length: 11,
 * //   encoding: "GSM-7",
 * //   segments: 1,
 * //   remainingChars: 149,
 * //   encodingDescription: "Standard text: 160 chars per message"
 * // }
 *
 * getMessageInfo("Hello 👋")
 * // {
 * //   text: "Hello 👋",
 * //   length: 8,
 * //   encoding: "UCS-2",
 * //   segments: 1,
 * //   remainingChars: 62,
 * //   encodingDescription: "Unicode (emojis, special chars): 70 chars per message"
 * // }
 */
export function getMessageInfo(message: string): {
  text: string
  length: number
  encoding: 'GSM-7' | 'UCS-2'
  segments: number
  remainingChars: number
  encodingDescription: string
} {
  const info = getMessageSegments(message)
  const isUcs2 = info.encoding === 'UCS-2'

  const remainingChars = info.segments === 1
    ? (isUcs2 ? 70 : 160) - info.totalChars
    : (isUcs2 ? 67 : 153) - (info.totalChars % (isUcs2 ? 67 : 153))

  return {
    text: message,
    length: info.totalChars,
    encoding: info.encoding,
    segments: info.segments,
    remainingChars,
    encodingDescription: isUcs2
      ? 'Unicode (emojis, special chars): 70 chars per message'
      : 'Standard text: 160 chars per message'
  }
}

/**
 * Calculate total cost segments for bulk campaign
 *
 * @param message - Message text
 * @param recipientCount - Number of recipients
 * @returns Total number of SMS segments (message segments × recipients)
 */
export function calculateCostSegments(message: string, recipientCount: number): number {
  const info = getMessageSegments(message)
  return info.segments * recipientCount
}

/**
 * Estimate SMS cost based on segments
 *
 * @param segments - Number of SMS segments
 * @param costPerSegment - Cost per SMS segment (default: $0.01)
 * @returns Estimated cost in USD
 */
export function estimateCost(segments: number, costPerSegment: number = 0.01): number {
  return segments * costPerSegment
}
