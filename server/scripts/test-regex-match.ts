/**
 * Test OTP regex matching - CORRECTED VERSION
 */

// Helper: Escape regex special chars (from cathai)
function escapeRegex(s: string = ''): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeToSingleLine(str: string = ''): string {
  return str
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Smart OTP regex builder (EXACT copy from cathai/fetch-handler.js)
function buildSmartOtpRegexList(formats: any[]): RegExp[] {
  if (!formats || formats.length === 0) return []
  if (!Array.isArray(formats)) formats = [formats]

  return formats
    .map((format) => {
      format = normalizeToSingleLine(format)
      // Check for any OTP pattern: {otp}, {otp4}, {otp5}, {otp6}, etc.
      if (!format.includes('{otp')) return null

      let pattern = escapeRegex(format)

      let isFirstOtp = true

      // Handle {otp5} - exactly 5 digits
      if (format.includes('{otp5}')) {
        pattern = pattern.replace(/\\\{otp5\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return '(?<otp>\\d{5})'
          }
          return '(?:\\d{5})'
        })
      } else {
        // Handle {otp} - 3-12 characters (original behavior)
        pattern = pattern.replace(/\\\{otp\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return '(?<otp>[A-Za-z0-9\\-]{3,12})'
          }
          return '(?:[A-Za-z0-9\\-]{3,12})'
        })
      }

      pattern = pattern.replace(/\\\{date\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{datetime\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{time\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{random\\\}/gi, '.+?')
      pattern = pattern.replace(/\\\{.*?\\\}/gi, '.*?')

      pattern = pattern
        .replace(/\\s+/g, '\\s*')
        .replace(/\\:/g, '[:：]?')
        .replace(/\\\./g, '.*?')

      return new RegExp(pattern, 'i')
    })
    .filter(Boolean) as RegExp[]
}

// Test
console.log('[Test] Testing OTP regex matching...\n')

const formats = [
  '{otp} is your OTP to login into Airtel app. Valid for {time}. Do not share with anyone. If this was not you click {any} {random}'
]

const otpRegexList = buildSmartOtpRegexList(formats)

console.log(`[Test] Built ${otpRegexList.length} regex patterns\n`)

// Show the actual regex patterns
otpRegexList.forEach((regex, i) => {
  console.log(`[Test] Pattern ${i + 1}: ${regex}\n`)
})

// Test messages
const testMessages = [
  '<#> 4720 is your OTP to login into Airtel app. Valid for 100 secs. Do not share with anyone. If this was not you click i.airtel.in/Contact N9BWuqauU1y',
  '4720 is your OTP to login into Airtel app. Valid for 100 secs. Do not share with anyone. If this was not you click i.airtel.in/Contact N9BWuqauU1y',
]

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('[Test] Testing messages:\n')

testMessages.forEach((msg, idx) => {
  const cleanMessage = normalizeToSingleLine(msg)
  console.log(`[${idx + 1}] ${cleanMessage}`)

  let otpFound: string | null = null

  for (const regex of otpRegexList) {
    regex.lastIndex = 0
    const m = regex.exec(cleanMessage)
    otpFound = (m as any)?.groups?.otp || (m && m[1]) || null
    if (otpFound) {
      console.log(`    ✓ OTP: ${otpFound}`)
      break
    }
  }

  if (!otpFound) {
    console.log(`    ✗ No match`)
  }
  console.log()
})

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
