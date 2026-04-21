/**
 * FCM Send Functions
 *
 * Functions for sending FCM notifications to Android devices.
 * Used primarily for remote wake-up functionality.
 */

import { getFirebaseApp, isFcmReady } from './index'
import { getMessaging, Messaging } from 'firebase-admin/messaging'

export interface WakeUpResult {
  success: boolean
  isStaleToken: boolean
}

/**
 * Send a wake-up notification to a device.
 *
 * @param deviceId - The device ID to wake up
 * @param fcmToken - The FCM token for the device
 * @returns Result object with success status and stale token flag
 */
export async function sendWakeUpNotification(
  deviceId: string,
  fcmToken: string | null | undefined
): Promise<WakeUpResult> {
  if (!fcmToken) {
    console.warn('[FCM] No FCM token provided - cannot send wake-up notification')
    return { success: false, isStaleToken: false }
  }

  // Get Firebase app (initializes if needed for API route context)
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) {
    console.warn('[FCM] Firebase not initialized - cannot send wake-up notification')
    return { success: false, isStaleToken: false }
  }

  try {
    const messaging = getMessaging(firebaseApp)
    const message = {
      token: fcmToken,
      data: {
        type: 'wakeup',
        server_timestamp: new Date().toISOString()
      },
      android: {
        priority: 'high' as const,
        ttl: 0 // Message must be delivered now or not at all
      }
      // No notification payload - we want a silent data message
      // that triggers onMessageReceived() in the app
    }

    const response = await messaging.send(message)
    // console.log(`[FCM] Wake-up notification sent to device ${deviceId}:`, response)
    return { success: true, isStaleToken: false }

  } catch (error: any) {
    // Handle specific FCM errors
    if (error.code === 'messaging/registration-token-not-registered') {
      // console.warn(`[FCM] Device ${deviceId} has unregistered FCM token - token may be stale`)
      return { success: false, isStaleToken: true }
    } else if (error.code === 'messaging/invalid-argument') {
      console.error(`[FCM] Invalid FCM token for device ${deviceId}:`, error.message)
    } else {
      console.error(`[FCM] Failed to send wake-up to device ${deviceId}:`, error)
    }
    return { success: false, isStaleToken: false }
  }
}

/**
 * Send a custom data message to a device.
 *
 * @param fcmToken - The FCM token for the device
 * @param data - Custom data to send
 * @returns True if message sent successfully
 */
export async function sendToDevice(
  fcmToken: string,
  data: Record<string, string>
): Promise<boolean> {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) {
    console.warn('[FCM] Firebase not initialized')
    return false
  }

  try {
    const messaging = getMessaging(firebaseApp)
    const message = {
      token: fcmToken,
      data: data,
      android: {
        priority: 'high' as const
      }
    }

    const response = await messaging.send(message)
    // console.log('[FCM] Message sent:', response)
    return true

  } catch (error) {
    console.error('[FCM] Failed to send message:', error)
    return false
  }
}

export default {
  sendWakeUpNotification,
  sendToDevice
}
