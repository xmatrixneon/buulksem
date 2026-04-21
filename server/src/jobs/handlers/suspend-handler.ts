/**
 * Suspend Handler
 *
 * Manages phone number quality-based suspension and recovery.
 * Suspends numbers with failed orders (N+ orders, all with 0 SMS) and recovers when SMS received.
 */

import { prisma } from '../../db/prisma'

// Configuration
const SMS_AUTO_SUSPEND_ENABLED = process.env.SMS_AUTO_SUSPEND_ENABLED !== 'false'
const SMS_SUSPEND_ORDER_THRESHOLD = parseInt(process.env.SMS_SUSPEND_ORDER_THRESHOLD || '10')
const SMS_SUSPEND_WINDOW_HOURS = parseInt(process.env.SMS_SUSPEND_WINDOW_HOURS || '24')
const SMS_SUSPEND_INACTIVITY_DAYS = parseInt(process.env.SMS_SUSPEND_INACTIVITY_DAYS || '1')
const SMS_SUSPEND_DRY_RUN = process.env.SMS_SUSPEND_DRY_RUN === 'true'
const SMS_TEST_NUMBER = process.env.SMS_TEST_NUMBER ? parseInt(process.env.SMS_TEST_NUMBER) : null

interface SuspendJobResult {
  success: boolean
  processed?: number
  duration?: number
  details?: {
    suspended?: number
    recovered?: number
    skipped?: number
    inactivitySkipped?: number
    disabled?: boolean
  }
  error?: string
}

export async function handleSuspendJob(data: any): Promise<SuspendJobResult> {
  const startTime = Date.now()
  const { type = 'suspend-check' } = data

  if (!SMS_AUTO_SUSPEND_ENABLED) {
    console.log(`[Suspend] SMS auto-suspend is DISABLED via SMS_AUTO_SUSPEND_ENABLED`)
    return {
      success: true,
      processed: 0,
      duration: Date.now() - startTime,
      details: { disabled: true }
    }
  }

  let result
  if (type === 'suspend-check') {
    result = await suspendLowSmsNumbers()
  } else if (type === 'recovery-check') {
    result = await recoverLowSmsNumbers()
  } else {
    return {
      success: false,
      processed: 0,
      error: 'Unknown job type',
      duration: Date.now() - startTime
    }
  }

  return {
    success: true,
    processed: result.checked || 0,
    duration: Date.now() - startTime,
    details: result
  }
}

/**
 * Suspend numbers with failed orders (N+ orders, all with 0 SMS)
 */
async function suspendLowSmsNumbers(): Promise<{
  suspended: number
  recovered: number
  skipped: number
  inactivitySkipped: number
  checked: number
}> {
  const cutoffTime = new Date(Date.now() - SMS_SUSPEND_WINDOW_HOURS * 60 * 60 * 1000)

  // Step 1: Find numbers with N+ orders where ALL have 0 messages
  const allOrders = await prisma.orders.findMany({
    where: {
      createdAt: { gte: cutoffTime }
    },
    select: {
      number: true,
      message: true
    }
  })

  // Count orders per number and track messages
  const orderCounts = new Map<number, { total: number; withMessages: number; totalMessages: number }>()

  for (const order of allOrders) {
    const orderNumber = order.number
    const messages = Array.isArray(order.message) ? order.message : []
    const current = orderCounts.get(orderNumber) || { total: 0, withMessages: 0, totalMessages: 0 }

    current.total++
    current.totalMessages += messages.length
    if (messages.length > 0) {
      current.withMessages++
    }

    orderCounts.set(orderNumber, current)
  }

  // Filter numbers that meet threshold
  const numbersToSuspend: number[] = []
  for (const [number, stats] of orderCounts) {
    if (stats.total >= SMS_SUSPEND_ORDER_THRESHOLD && stats.withMessages === 0) {
      numbersToSuspend.push(number)
    }
  }

  // Apply test number filter if specified
  if (SMS_TEST_NUMBER) {
    const filtered = numbersToSuspend.filter(n => n === SMS_TEST_NUMBER)
    console.log(`[Suspend] TEST MODE: Only checking number ${SMS_TEST_NUMBER}`)
    return processSuspendList(filtered, cutoffTime)
  }

  return processSuspendList(numbersToSuspend, cutoffTime)
}

async function processSuspendList(numbersToSuspend: number[], cutoffTime: Date): Promise<{
  suspended: number
  recovered: number
  skipped: number
  inactivitySkipped: number
  checked: number
}> {
  let suspendedCount = 0
  let skippedCount = 0
  let inactivitySkippedCount = 0

  // Calculate inactivity cutoff date
  const inactivityCutoffDate = new Date(Date.now() - SMS_SUSPEND_INACTIVITY_DAYS * 24 * 60 * 60 * 1000)

  for (const number of numbersToSuspend) {
    const numberRecord = await prisma.numbers.findFirst({
      where: {
        number,
        active: true,
        suspended: false
      }
    })

    if (!numberRecord) {
      skippedCount++
      continue
    }

    // Check last message received time for this number
    const lastMessage = await prisma.message.findFirst({
      where: { receiver: number.toString() },
      orderBy: { time: 'desc' }
    })

    const lastMessageTime = lastMessage?.time || null

    // Skip if number received a message recently (within inactivity period)
    if (lastMessageTime && lastMessageTime > inactivityCutoffDate) {
      const daysSinceLastMessage = Math.floor((Date.now() - lastMessageTime.getTime()) / (24 * 60 * 60 * 1000))
      inactivitySkippedCount++
      continue
    }

    if (!SMS_SUSPEND_DRY_RUN) {
      // Count total SMS in window for tracking
      const smsInWindow = await prisma.orders.aggregate({
        where: {
          number,
          createdAt: { gte: cutoffTime }
        },
        _count: {
          message: true
        }
      })

      const totalSms = smsInWindow._count.message || 0

      await prisma.numbers.update({
        where: { id: numberRecord.id },
        data: {
          suspended: true,
          suspensionReason: 'low_sms',
          suspendedAt: new Date(),
          lastLowSmsCheck: new Date(),
          smsReceivedInWindow: totalSms,
          lowSmsSuspensionCount: { increment: 1 }
        }
      })
      suspendedCount++
    }
  }

  console.log(`[Suspend] Suspend check complete: ${suspendedCount} suspended, ${inactivitySkippedCount} skipped (recent), ${skippedCount} skipped (other)`)

  return {
    suspended: suspendedCount,
    recovered: 0,
    skipped: skippedCount,
    inactivitySkipped: inactivitySkippedCount,
    checked: numbersToSuspend.length
  }
}

/**
 * Recover suspended numbers that have received SMS
 */
async function recoverLowSmsNumbers(): Promise<{
  suspended: number
  recovered: number
  skipped: number
  inactivitySkipped: number
  checked: number
}> {
  const cutoffTime = new Date(Date.now() - SMS_SUSPEND_WINDOW_HOURS * 60 * 60 * 1000)

  const lowSmsSuspended = await prisma.numbers.findMany({
    where: {
      active: true,
      suspended: true,
      suspensionReason: 'low_sms'
    }
  })

  let recoveredCount = 0

  for (const number of lowSmsSuspended) {
    // Get SMS count for this number in the time window
    const smsResult = await prisma.orders.aggregate({
      where: {
        number: number.number,
        createdAt: { gte: cutoffTime }
      },
      _count: {
        message: true
      }
    })

    const smsCount = smsResult._count.message || 0

    // Update check time and smsReceivedInWindow
    await prisma.numbers.update({
      where: { id: number.id },
      data: {
        lastLowSmsCheck: new Date(),
        smsReceivedInWindow: smsCount
      }
    })

    // Recover if ANY SMS received
    if (smsCount > 0) {
      await prisma.numbers.update({
        where: { id: number.id },
        data: {
          suspended: false,
          suspensionReason: 'none',
          suspendedAt: null
        }
      })
      recoveredCount++
    }
  }

  console.log(`[Suspend] Recovery check complete: ${recoveredCount} recovered, ${lowSmsSuspended.length - recoveredCount} still suspended`)

  return {
    suspended: 0,
    recovered: recoveredCount,
    skipped: 0,
    inactivitySkipped: 0,
    checked: lowSmsSuspended.length
  }
}
