/**
 * Keepalive Handler
 *
 * Sends FCM keep-alive pings to devices with active orders.
 * Helps maintain device connectivity when orders are pending.
 */

import { prisma } from '../../db/prisma'
import { sendWakeUpNotification } from '../../lib/fcm/send'
import { initializeFirebase } from '../../lib/fcm/index'

interface KeepaliveJobResult {
  success: boolean
  processed?: number
  duration?: number
  details?: {
    notificationsSent?: number
    skipped?: number
    staleTokensRemoved?: number
    failed?: number
  }
  error?: string
}

// Configuration
const COOLDOWN_MINUTES = parseInt(process.env.FCM_KEEP_ALIVE_COOLDOWN || '3')
const MIN_HEARTBEAT_AGE_SECONDS = parseInt(process.env.FCM_KEEP_ALIVE_MIN_HEARTBEAT_AGE || '45')

// Track keep-alive attempts to avoid spamming
const keepAliveAttempts = new Map<string, { lastAttempt: number }>()

/**
 * Find devices that have active orders
 */
async function findDevicesWithActiveOrders(): Promise<any[]> {
  // Step 1: Get all active orders
  const activeOrders = await prisma.orders.findMany({
    where: { active: true },
    select: { number: true }
  })

  if (activeOrders.length === 0) {
    return []
  }

  // Step 2: Extract unique phone numbers
  const phoneNumbers = [...new Set(activeOrders.map(order => order.number))]

  // Step 3: Lookup numbers collection to get ports
  const numbers = await prisma.numbers.findMany({
    where: {
      number: { in: phoneNumbers },
      active: true
    },
    select: { number: true, port: true }
  })

  if (numbers.length === 0) {
    return []
  }

  // Step 4: Parse port field to extract device IDs
  const deviceIds = new Set<string>()
  for (const num of numbers) {
    if (num.port) {
      // Port format: {deviceId}-SIM{slot}
      const deviceId = num.port.replace(/-SIM\d+$/, '')
      if (deviceId) {
        deviceIds.add(deviceId)
      }
    }
  }

  if (deviceIds.size === 0) {
    return []
  }

  // Step 5: Lookup devices with these IDs and valid FCM tokens
  const deviceIdArray = Array.from(deviceIds)
  const devices = await prisma.device.findMany({
    where: {
      deviceId: { in: deviceIdArray },
      isActive: true,
      fcmToken: { not: null }
    }
  })

  return devices
}

/**
 * Check if a device can receive a keep-alive ping
 */
function canSendKeepAlive(device: any): boolean {
  const now = Date.now()
  const attempts = keepAliveAttempts.get(device.deviceId)

  if (!attempts) {
    return true // Never attempted, can send
  }

  const timeSinceLastAttempt = (now - attempts.lastAttempt) / 1000 / 60 // in minutes

  // Check cooldown period
  if (timeSinceLastAttempt < COOLDOWN_MINUTES) {
    return false // Still in cooldown
  }

  return true // Cooldown has passed, can send
}

/**
 * Record a keep-alive attempt
 */
function recordKeepAliveAttempt(deviceId: string) {
  const now = Date.now()
  keepAliveAttempts.set(deviceId, {
    lastAttempt: now
  })
}

/**
 * Clean up old keep-alive attempt records
 */
function cleanupOldAttempts() {
  const now = Date.now()
  const maxAge = COOLDOWN_MINUTES * 2 * 60 * 1000 // 2x cooldown period

  for (const [deviceId, attempt] of keepAliveAttempts.entries()) {
    if (now - attempt.lastAttempt > maxAge) {
      keepAliveAttempts.delete(deviceId)
    }
  }
}

/**
 * Process devices with active orders and send keep-alive pings
 */
async function sendKeepAlivePings() {
  // Initialize Firebase
  initializeFirebase()

  const devices = await findDevicesWithActiveOrders()

  if (devices.length === 0) {
    return {
      success: true,
      notificationsSent: 0,
      skipped: 0,
      staleTokensRemoved: 0,
      failed: 0
    }
  }

  let successCount = 0
  let skipCount = 0
  let failCount = 0
  let staleTokenCount = 0
  let tooRecentCount = 0

  for (const device of devices) {
    // Check heartbeat age
    const heartbeatAge = Math.floor((Date.now() - new Date(device.lastHeartbeat).getTime()) / 1000)

    // Skip if heartbeat is too recent (device is actively maintaining connection)
    if (heartbeatAge < MIN_HEARTBEAT_AGE_SECONDS) {
      tooRecentCount++
      continue
    }

    // Check cooldown
    if (!canSendKeepAlive(device)) {
      const attempts = keepAliveAttempts.get(device.deviceId)
      const timeSinceLastAttempt = Math.floor((Date.now() - (attempts?.lastAttempt || 0)) / 1000 / 60)
      skipCount++
      continue
    }

    // Send FCM keep-alive notification
    const result = await sendWakeUpNotification(device.deviceId, device.fcmToken)

    if (result.success) {
      recordKeepAliveAttempt(device.deviceId)
      successCount++
    } else if (result.isStaleToken) {
      staleTokenCount++
      // Remove stale FCM token
      await prisma.device.update({
        where: { deviceId: device.deviceId },
        data: { fcmToken: null, fcmTokenUpdatedAt: null }
      })
    } else {
      failCount++
    }
  }

  console.log(`[Keepalive] Scan complete: ${successCount} pinged, ${skipCount} skipped (cooldown), ${tooRecentCount} too recent, ${staleTokenCount} stale tokens, ${failCount} failed`)

  return {
    success: true,
    notificationsSent: successCount,
    skipped: skipCount + tooRecentCount,
    staleTokensRemoved: staleTokenCount,
    failed: failCount
  }
}

export async function handleKeepaliveJob(data: any): Promise<KeepaliveJobResult> {
  const startTime = Date.now()

  try {
    console.log('[Keepalive] Starting FCM keep-alive job')

    // Run cleanup of old attempts
    cleanupOldAttempts()

    // Send keep-alive pings
    const result = await sendKeepAlivePings()

    return {
      success: result.success,
      processed: result.notificationsSent + result.skipped + result.failed,
      duration: Date.now() - startTime,
      details: result
    }

  } catch (error) {
    return {
      success: false,
      processed: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    }
  }
}
