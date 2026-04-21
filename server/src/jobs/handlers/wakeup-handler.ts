/**
 * Wakeup Handler
 *
 * Sends FCM wake-up notifications to Android devices that haven't been seen recently.
 * Helps maintain device connectivity and real-time communication.
 */

import { prisma } from '../../db/prisma'
import { sendWakeUpNotification } from '../../lib/fcm/send'
import { initializeFirebase } from '../../lib/fcm/index'

interface WakeupJobResult {
  success: boolean
  processed?: number
  errors?: number
  duration?: number
  details?: {
    offlineDevicesFound?: number
    devicesEligible?: number
    notificationsSent?: number
    staleTokensRemoved?: number
    cooldownMinutes?: number
  }
  error?: string
}

export async function handleWakeupJob(data: any): Promise<WakeupJobResult> {
  const startTime = Date.now()
  let processed = 0
  let errors = 0
  let notificationsSent = 0
  let staleTokensRemoved = 0

  try {
    const { type = 'scheduled', targetDeviceId = null } = data
    const offlineThreshold = parseInt(process.env.FCM_WAKE_UP_OFFLINE_THRESHOLD || '120', 10) * 1000
    const cooldownMinutes = parseInt(process.env.FCM_WAKE_UP_COOLDOWN || '5', 10)
    const cooldownMs = cooldownMinutes * 60 * 1000

    // Initialize Firebase (safe to call multiple times)
    initializeFirebase()

    const now = Date.now()
    const cutoffTime = new Date(now - offlineThreshold)
    const cooldownCutoff = new Date(now - cooldownMs)

    // Build query for offline devices with FCM tokens
    const where: any = {
      isActive: true,
      lastHeartbeat: { lt: cutoffTime },
      fcmToken: { not: null }
    }

    if (targetDeviceId) {
      where.deviceId = targetDeviceId
    }

    // Find ALL offline devices with FCM tokens
    const offlineDevices = await prisma.device.findMany({
      where
    })

    // Filter out devices recently attempted (respect cooldown)
    // Skip cooldown check if cooldownMinutes is 0 (retry every cycle)
    const devicesToWake = offlineDevices.filter((device) => {
      if (cooldownMinutes === 0) return true // No cooldown - always wake up
      if (!device.lastWakeupAttempt) return true
      return new Date(device.lastWakeupAttempt) < cooldownCutoff
    })

    console.log(`[Wakeup] Starting: ${devicesToWake.length} devices to wake (offline threshold: ${offlineThreshold / 1000}s, cooldown: ${cooldownMinutes}m)`)

    if (devicesToWake.length === 0) {
      console.log(`[Wakeup] No devices to wake`)
      return {
        success: true,
        processed: 0,
        errors: 0,
        duration: Date.now() - startTime,
        details: {
          offlineDevicesFound: offlineDevices.length,
          devicesEligible: 0,
          notificationsSent: 0,
          staleTokensRemoved: 0,
          cooldownMinutes
        }
      }
    }

    // Process devices silently
    for (const device of devicesToWake) {
      processed++

      try {
        const result = await sendWakeUpNotification(device.deviceId, device.fcmToken)

        if (result.success) {
          notificationsSent++
          await prisma.device.update({
            where: { deviceId: device.deviceId },
            data: { lastWakeupAttempt: new Date() }
          })
        } else if (result.isStaleToken) {
          errors++
          staleTokensRemoved++
          // Remove stale FCM token so device isn't retried in future cycles
          await prisma.device.update({
            where: { deviceId: device.deviceId },
            data: { fcmToken: null, fcmTokenUpdatedAt: null }
          })
        } else {
          errors++
        }
      } catch (err) {
        errors++
      }
    }

    // Summary log
    const duration = Date.now() - startTime
    console.log(`[Wakeup] Completed: ${notificationsSent} sent, ${staleTokensRemoved} stale tokens removed, ${errors} failed (${duration}ms)`)

    return {
      success: true,
      processed,
      errors,
      duration,
      details: {
        offlineDevicesFound: offlineDevices.length,
        devicesEligible: devicesToWake.length,
        notificationsSent,
        staleTokensRemoved,
        cooldownMinutes
      }
    }
  } catch (error) {
    console.error(`[Wakeup] Error:`, error)
    return {
      success: false,
      processed,
      errors: errors + 1,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
