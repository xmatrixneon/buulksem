/**
 * Fetch Handler
 *
 * OTP fetch job handler with batch optimization.
 * Integrates with Service model for format fallback, Lock model for number locking,
 * and Numbers model for quality tracking.
 */

import { prisma } from '../../db/prisma'

type LockCreateData = {
  number: number
  countryid: string
  serviceid: string
}

type QualityUpdate = {
  number: number
  impact: number
  reason: string
  orderId: string
}

interface FetchJobResult {
  success: boolean
  processed?: number
  errors?: number
  otpsFound?: number
  expired?: number
  locksCreated?: number
  duration?: number
  details?: {
    activeOrders?: number
    otpsFound?: number
    messagesFetched?: number
    updatesExecuted?: number
    locksCreated?: number
  }
  error?: string
}

// Escape regex special chars
function escapeRegex(s: string = ''): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeToSingleLine(str: string = ''): string {
  return str
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Smart OTP regex builder — generalized to handle any {otpN} length dynamically
function buildSmartOtpRegexList(formats: any[]): RegExp[] {
  if (!formats || formats.length === 0) return []
  if (!Array.isArray(formats)) formats = [formats]

  return formats
    .map((format) => {
      format = normalizeToSingleLine(format)
      if (!format.includes('{otp')) return null

      let pattern = escapeRegex(format)
      let isFirstOtp = true

      // OTP FIX - Fixed-length OTP
      const fixedOtpMatch = format.match(/\{otp(\d+)\}/)
      if (fixedOtpMatch) {
        const length = parseInt(fixedOtpMatch[1], 10)
        pattern = pattern.replace(/\\\{otp\d+\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return `(?<otp>\\b\\d{${length}}\\b)`
          }
          return `(?:\\b\\d{${length}}\\b)`
        })
      } else {
        // OTP FIX - Stronger regex for OTP and voucher codes
        pattern = pattern.replace(/\\\{otp\\\}/gi, () => {
          if (isFirstOtp) {
            isFirstOtp = false
            return '(?<otp>\\d{4,8}|[A-Za-z0-9\\-]{6,25})'
          }
          return '(?:\\d{4,8}|[A-Za-z0-9\\-]{6,25})'
        })
      }

      // Placeholders - FIX random vs any
      pattern = pattern.replace(/\\\{date\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{time\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{datetime\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{random\\\}/gi, '[A-Za-z0-9]{3,15}')
      pattern = pattern.replace(/\\\{any\\\}/gi, '.*?')
      pattern = pattern.replace(/\\\{.*?\\\}/gi, '.*?')

      // Spacing + punctuation - FIX dot
      pattern = pattern
        .replace(/\\s+/g, '\\s*')
        .replace(/\\:/g, '[:：]?')
        .replace(/\\\./g, '\\.?') // FIXED: was .*?

      // Bracket support - NEW
      pattern = pattern
        .replace(/\\\(/g, '[\\(\\[\\{【]?')
        .replace(/\\\)/g, '[\\)\\]\\}】]?')

      return new RegExp(pattern, 'i')
    })
    .filter(Boolean) as RegExp[]
}

/**
 * Pre-fetch all services needed by a list of orders in ONE query.
 * Returns a map of serviceid -> service for O(1) access per order.
 */
async function buildServiceCache(
  orders: Array<{ serviceid: string }>
): Promise<Map<string, { format: any; maxmessage: number }>> {
  const serviceIds = [...new Set(orders.map((o) => o.serviceid))]
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, format: true, maxmessage: true }
  })
  return new Map(services.map((s) => [s.id, { format: s.format, maxmessage: s.maxmessage }]))
}

function getOrderFormats(order: any, serviceCache: Map<string, any>): any[] {
  const formats = (order.format as any[]) || []
  if (formats.length > 0) return formats
  return (serviceCache.get(order.serviceid)?.format as any[]) || []
}

function getOrderMaxmessage(order: any, serviceCache: Map<string, any>): number {
  const maxmessage = (order.maxmessage as number) || 0
  if (maxmessage !== 0) return maxmessage
  return (serviceCache.get(order.serviceid)?.maxmessage as number) || 0
}

/**
 * Batch update quality for multiple numbers:
 * 1 read (findMany) + parallel writes
 */
async function batchUpdateNumberQuality(updates: QualityUpdate[]): Promise<void> {
  if (updates.length === 0) return

  // Merge impacts for same number
  const byNumber = new Map<number, { impact: number; reasons: string[] }>()
  for (const u of updates) {
    if (!byNumber.has(u.number)) byNumber.set(u.number, { impact: 0, reasons: [] })
    const entry = byNumber.get(u.number)!
    entry.impact += u.impact
    entry.reasons.push(u.reason)
  }

  const numbers = Array.from(byNumber.keys())

  // ONE query for all number docs
  const numDocs = await prisma.numbers.findMany({ where: { number: { in: numbers } } })
  const numDocsMap = new Map(numDocs.map((d) => [d.number, d]))
  const now = new Date()

  // Parallel writes
  await Promise.all(
    Array.from(byNumber.entries()).map(async ([number, data]) => {
      const numDoc = numDocsMap.get(number)
      if (!numDoc) return

      const isSuccess = data.impact > 0
      const newQualityScore = Math.max(0, Math.min(100, (numDoc.qualityScore || 100) + data.impact))

      await prisma.numbers.update({
        where: { number },
        data: {
          qualityScore: newQualityScore,
          failureCount: isSuccess ? numDoc.failureCount : (numDoc.failureCount || 0) + 1,
          successCount: isSuccess ? (numDoc.successCount || 0) + 1 : numDoc.successCount,
          consecutiveFailures: isSuccess ? 0 : (numDoc.consecutiveFailures || 0) + 1,
          lastFailureAt: !isSuccess ? now : numDoc.lastFailureAt,
          lastSuccessAt: isSuccess ? now : numDoc.lastSuccessAt
        }
      })
    })
  )
}

export async function handleFetchJob(_data: any): Promise<FetchJobResult> {
  const startTime = Date.now()
  let processed = 0
  let errors = 0
  let otpsFound = 0
  let locksCreated = 0

  try {
    console.log('[Fetch] Starting OTP fetch job (BATCH OPTIMIZED)')

    const activeOrders = await prisma.orders.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' }
    })

    console.log(`[Fetch] Found ${activeOrders.length} active orders`)

    if (activeOrders.length === 0) {
      // Update cron even when no orders to process
      try {
        await prisma.cron.upsert({
          where: { name: 'fetchOrders' },
          create: { name: 'fetchOrders', lastRun: new Date() },
          update: { lastRun: new Date() }
        })
        console.log('[Fetch] Cron updated (no active orders)')
      } catch (cronErr) {
        console.error('[Fetch] Failed to update CronStatus:', cronErr)
      }
      return { success: true, processed: 0, errors: 0, otpsFound: 0, expired: 0, locksCreated: 0, duration: 0 }
    }

    // Pre-fetch all services in ONE query (shared by all orders)
    const serviceCache = await buildServiceCache(activeOrders)
    console.log(`[Fetch] Loaded ${serviceCache.size} services into cache`)

    // Find oldest order to set the batch message query window
    const minCreatedAt = activeOrders.reduce(
      (min, order) => (order.createdAt < min ? order.createdAt : min),
      activeOrders[0].createdAt
    )
    const sinceTime = new Date(minCreatedAt.getTime() - 180000)

    console.log(`[Fetch] Fetching all messages since ${sinceTime.toISOString()} (BATCH QUERY)`)

    // ONE query for all recent messages
    const allRecentMessages = await prisma.message.findMany({
      where: { time: { gte: sinceTime } },
      orderBy: { createdAt: 'asc' }
    })

    console.log(`[Fetch] Fetched ${allRecentMessages.length} total recent messages in 1 query`)

    // Group messages by receiver for O(1) lookup
    const messagesByReceiver = new Map<string, typeof allRecentMessages>()
    for (const msg of allRecentMessages) {
      const receiver = msg.receiver || ''
      if (!messagesByReceiver.has(receiver)) messagesByReceiver.set(receiver, [])
      messagesByReceiver.get(receiver)!.push(msg)
    }

    console.log(`[Fetch] Grouped into ${messagesByReceiver.size} unique receiver numbers`)

    // Collect all deferred operations
    const expiredOrderUpdates: Array<{ id: string; failureReason: string; qualityImpact: number }> = []
    const successOrderUpdates: Array<{ id: string; updateData: any }> = []
    const locksToCreate: Array<LockCreateData> = []
    const qualityUpdates: QualityUpdate[] = []

    for (const order of activeOrders) {
      processed++
      const now = new Date()
      const ageMinutes = (now.getTime() - order.createdAt.getTime()) / (1000 * 60)
      const currentMessages = Array.isArray(order.message) ? (order.message as string[]) : []

      // 1. Expire after 15 min
      if (ageMinutes > 15) {
        let failureReason: string
        let qualityImpact: number

        if (order.isused === true) {
          failureReason = order.failureReason || 'none'
          qualityImpact = order.qualityImpact || 5
        } else if (currentMessages.length === 0) {
          failureReason = 'expired_no_recharge'
          qualityImpact = -15
        } else {
          failureReason = 'expired_no_sms'
          qualityImpact = 0
        }

        expiredOrderUpdates.push({ id: order.id, failureReason, qualityImpact })

        if (qualityImpact !== 0 && order.isused !== true) {
          qualityUpdates.push({ number: order.number, impact: qualityImpact, reason: failureReason, orderId: order.id })
        }
        continue
      }

      // 2. Check message limit
      const maxmessage = getOrderMaxmessage(order, serviceCache)
      if (maxmessage !== 0 && currentMessages.length >= maxmessage) continue

      // 3. Resolve number formats
      const orderNumberStr = order.number.toString()
      let fullNumber: string
      let numberWithCountry: string
      const dialcode = (order.dialcode as number) || 91

      if (dialcode === 91 && orderNumberStr.length === 12 && orderNumberStr.startsWith('91')) {
        numberWithCountry = orderNumberStr
        fullNumber = `+${orderNumberStr}`
      } else if (dialcode === 91 && orderNumberStr.length === 10 && !orderNumberStr.startsWith('91')) {
        numberWithCountry = `91${orderNumberStr}`
        fullNumber = `+${numberWithCountry}`
      } else if (dialcode === 91 && orderNumberStr.length === 10 && orderNumberStr.startsWith('91')) {
        numberWithCountry = orderNumberStr
        fullNumber = `+${orderNumberStr}`
      } else {
        numberWithCountry = `${dialcode}${orderNumberStr}`
        fullNumber = `+${numberWithCountry}`
      }

      // 4. In-memory message lookup (no DB query)
      let matchedMessages: typeof allRecentMessages = []

      const exactMatches =
        messagesByReceiver.get(fullNumber) ||
        messagesByReceiver.get(orderNumberStr) ||
        messagesByReceiver.get(numberWithCountry)

      if (exactMatches) {
        matchedMessages = exactMatches.filter((msg) => {
          const orderTime = order.createdAt.getTime()
          const msgTime = new Date(msg.time || msg.createdAt || Date.now()).getTime()
          // FIXED: Only accept messages sent AFTER order was created
          return msgTime >= orderTime && msgTime <= orderTime + 900000
        })
      }

      // Partial match fallback (last 10 digits)
      if (matchedMessages.length === 0 && orderNumberStr.length >= 10) {
        const last10 = orderNumberStr.slice(-10)
        for (const [receiver, msgs] of messagesByReceiver) {
          if (receiver.includes(last10) || receiver.endsWith(last10)) {
            const partials = msgs.filter((msg) => {
              const orderTime = order.createdAt.getTime()
              const msgTime = new Date(msg.time || msg.createdAt || Date.now()).getTime()
              // FIXED: Only accept messages sent AFTER order was created
              return msgTime >= orderTime && msgTime <= orderTime + 900000
            })
            if (partials.length > 0) {
              matchedMessages = partials
              break
            }
          }
        }
      }

      if (matchedMessages.length > 0) {
        console.log(`[Fetch] Order ${order.id} — matched ${matchedMessages.length} messages`)
      }

      // 5. Multi-use logic - auto-accept messages up to maxmessage limit
      if (currentMessages.length > 0) {
        // Skip if not multi-use (single-use orders only accept one message)
        if (!(order.ismultiuse as boolean)) continue
        // Skip if we've reached maxmessage limit
        if (currentMessages.length >= (order.maxmessage || 1)) continue
      }

      // 6. Process messages — find OTP
      const formats = getOrderFormats(order, serviceCache)
      const otpRegexList = buildSmartOtpRegexList(formats)

      for (const msg of matchedMessages) {
        if (currentMessages.includes(msg.message)) continue

        const cleanMessage = normalizeToSingleLine(msg.message)
        let otpFound: string | null = null

        for (const regex of otpRegexList) {
          const m = regex.exec(cleanMessage)
          otpFound = (m as any)?.groups?.otp || (m && m[1]) || null
          if (otpFound) break
        }

        if (otpFound) {
          otpsFound++
          const updateData: any = { updatedAt: new Date() }

          // Only set nextsms to false if we've reached maxmessage limit
          if (currentMessages.length + 1 >= (order.maxmessage || 1)) {
            updateData.nextsms = false
          }

          if (currentMessages.length === 0) {
            updateData.isused = true
            updateData.failureReason = 'none'
            updateData.qualityImpact = 5
            updateData.numberSnapshot = { qualityScore: 100, consecutiveFailures: 0, signal: 0 }

            qualityUpdates.push({ number: order.number, impact: 5, reason: 'otp_received', orderId: order.id })
            locksToCreate.push({ number: order.number, countryid: order.countryid, serviceid: order.serviceid })
          }

          successOrderUpdates.push({
            id: order.id,
            updateData: { ...updateData, message: [...currentMessages, msg.message] }
          })
          break
        }
      }
    }

    // === EXECUTE BATCH OPERATIONS ===
    const batchNow = new Date()

    // Parallel: expire + success order updates
    await Promise.all([
      ...expiredOrderUpdates.map((u) =>
        prisma.orders.update({
          where: { id: u.id },
          data: { active: false, updatedAt: batchNow, failureReason: u.failureReason, qualityImpact: u.qualityImpact }
        })
      ),
      ...successOrderUpdates.map((u) =>
        prisma.orders.update({
          where: { id: u.id },
          data: u.updateData
        })
      )
    ])

    // Batch quality updates (1 read + parallel writes)
    await batchUpdateNumberQuality(qualityUpdates)

    // Create locks (ignore duplicates)
    for (const lockData of locksToCreate) {
      try {
        await prisma.lock.create({ data: lockData })
        locksCreated++
      } catch (e) {
        if ((e as any).code !== 'P2002') {
          console.error('[Fetch] Failed to create lock:', e)
        }
      }
    }

    console.log(
      `[Fetch] Done — processed: ${processed}, otpsFound: ${otpsFound}, expired: ${expiredOrderUpdates.length}, locks: ${locksCreated}`
    )

    // Update CronStatus
    try {
      await prisma.cron.upsert({
        where: { name: 'fetchOrders' },
        create: { name: 'fetchOrders', lastRun: new Date() },
        update: { lastRun: new Date() }
      })
    } catch (cronErr) {
      console.error('[Fetch] Failed to update CronStatus:', cronErr)
    }

    return {
      success: true,
      processed,
      errors,
      otpsFound,
      expired: expiredOrderUpdates.length,
      locksCreated,
      duration: Date.now() - startTime,
      details: {
        activeOrders: activeOrders.length,
        otpsFound,
        messagesFetched: allRecentMessages.length,
        updatesExecuted: expiredOrderUpdates.length + successOrderUpdates.length,
        locksCreated
      }
    }
  } catch (error) {
    errors++
    console.error('[Fetch] Error:', error)
    return {
      success: false,
      processed,
      errors,
      otpsFound,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}