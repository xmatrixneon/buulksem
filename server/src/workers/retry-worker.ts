/**
 * Retry Worker for Failed Bulk Messages
 *
 * Periodically checks for failed messages and retries them using:
 * - Exponential backoff with jitter
 * - Circuit breaker logic
 * - SIM failover
 * - Error classification
 */

import { prisma } from '../db/prisma'
import { getSocketManager } from '../websocket/manager'
import {
  shouldRetryMessage,
  checkCircuitBreaker,
  recordCircuitFailure,
  recordCircuitSuccess,
  selectBestSim,
  updateSimPerformance,
  classifyError,
  calculateBackoffDelay
} from '../lib/retry-utils'

// Worker configuration
const RETRY_WORKER_CONFIG = {
  checkInterval: 30000, // Check every 30 seconds
  batchSize: 10, // Process 10 messages per batch
  maxParallelRetries: 5 // Max concurrent retries
}

let retryWorkerInterval: NodeJS.Timeout | null = null
let isProcessing = false

/**
 * Start the retry worker
 */
export function startRetryWorker(): void {
  if (retryWorkerInterval) {
    console.log('[RetryWorker] Worker already running')
    return
  }

  console.log('[RetryWorker] Starting retry worker...')
  processFailedMessages() // Initial check

  retryWorkerInterval = setInterval(() => {
    processFailedMessages()
  }, RETRY_WORKER_CONFIG.checkInterval)

  console.log(`[RetryWorker] Worker started (interval: ${RETRY_WORKER_CONFIG.checkInterval}ms)`)
}

/**
 * Stop the retry worker
 */
export function stopRetryWorker(): void {
  if (retryWorkerInterval) {
    clearInterval(retryWorkerInterval)
    retryWorkerInterval = null
    console.log('[RetryWorker] Worker stopped')
  }
}

/**
 * Process failed messages that should be retried
 */
async function processFailedMessages(): Promise<void> {
  if (isProcessing) {
    console.log('[RetryWorker] Already processing, skipping this cycle')
    return
  }

  isProcessing = true
  const startTime = Date.now()

  try {
    // Get failed messages that haven't exceeded max retries
    const failedMessages = await prisma.bulkMessage.findMany({
      where: {
        status: 'failed',
        retryCount: { lt: 3 }, // Max retries hardcoded to 3 for now
        failedAt: {
          gte: new Date(Date.now() - 3600000) // Only retry failures from last hour
        }
      },
      take: RETRY_WORKER_CONFIG.batchSize,
      orderBy: { failedAt: 'asc' }, // Retry oldest failures first
      include: {
        campaign: true
      }
    })

    if (failedMessages.length === 0) {
      console.log('[RetryWorker] No failed messages to retry')
      return
    }

    console.log(`[RetryWorker] Found ${failedMessages.length} failed messages to retry`)

    // Process messages in parallel batches
    const retryPromises = failedMessages
      .slice(0, RETRY_WORKER_CONFIG.maxParallelRetries)
      .map(message => retryMessage(message))

    await Promise.allSettled(retryPromises)

    const processingTime = Date.now() - startTime
    console.log(`[RetryWorker] Processed ${failedMessages.length} messages in ${processingTime}ms`)

  } catch (error) {
    console.error('[RetryWorker] Error processing failed messages:', error)
  } finally {
    isProcessing = false
  }
}

/**
 * Retry a single failed message
 */
async function retryMessage(message: any): Promise<void> {
  try {
    console.log(`[RetryWorker] Retrying message ${message.id} (attempt ${message.retryCount + 1})`)

    // Check if message should be retried
    const retryDecision = shouldRetryMessage(
      message.retryCount,
      message.maxRetries || 3,
      message.failureReason
    )

    if (!retryDecision.shouldRetry) {
      console.log(`[RetryWorker] Message ${message.id} should not be retried: ${retryDecision.reason}`)
      return
    }

    // Calculate delay based on retry count
    const delayMs = retryDecision.delayMs || calculateBackoffDelay(message.retryCount)

    // Wait for backoff delay
    if (delayMs > 0) {
      console.log(`[RetryWorker] Waiting ${delayMs}ms before retrying message ${message.id}`)
      await sleep(delayMs)
    }

    // Check circuit breaker for device
    const deviceId = message.deviceId
    if (deviceId) {
      const circuitState = checkCircuitBreaker(deviceId)
      if (!circuitState.shouldRetry) {
        console.log(`[RetryWorker] Circuit breaker open for device ${deviceId}, skipping retry`)
        return
      }
    }

    // Get campaign details
    const campaign = await prisma.bulkCampaign.findUnique({
      where: { id: message.campaignId }
    })

    if (!campaign || campaign.status === 'cancelled') {
      console.log(`[RetryWorker] Campaign ${message.campaignId} not found or cancelled, skipping retry`)
      return
    }

    // Select device and SIM slot
    const { deviceId: selectedDeviceId, simSlot } = await selectDeviceForRetry(message, campaign)

    // Update message to queued status
    await prisma.bulkMessage.update({
      where: { id: message.id },
      data: {
        status: 'queued',
        deviceId: selectedDeviceId,
        simSlot,
        retryCount: { increment: 1 },
        failureReason: null,
        failedAt: null,
        updatedAt: new Date()
      }
    })

    // Send SMS command to device
    const socketManager = getSocketManager()
    if (!socketManager) {
      throw new Error('Socket manager not available')
    }

    const success = socketManager.sendToDevice(
      selectedDeviceId,
      'send_sms',
      {
        messageId: `bulk_${message.campaignId}_${message.id}`,
        phoneNumber: message.recipientNumber,
        message: message.message,
        simSlot,
        metadata: {
          campaignId: message.campaignId,
          bulkMessageId: message.id,
          isRetry: true,
          retryCount: message.retryCount + 1
        }
      }
    )

    if (success) {
      console.log(`[RetryWorker] Successfully queued retry for message ${message.id} to device ${selectedDeviceId} via SIM ${simSlot}`)
      recordCircuitSuccess(selectedDeviceId)
    } else {
      throw new Error('Device not responding')
    }

  } catch (error) {
    console.error(`[RetryWorker] Error retrying message ${message.id}:`, error)

    // Update message failure count and reason
    await prisma.bulkMessage.update({
      where: { id: message.id },
      data: {
        retryCount: { increment: 1 },
        failureReason: error instanceof Error ? error.message : 'Retry failed',
        failedAt: new Date(),
        updatedAt: new Date()
      }
    })

    // Record circuit failure if this was a device issue
    if (error instanceof Error && error.message.includes('Device')) {
      const deviceId = message.deviceId
      if (deviceId) {
        recordCircuitFailure(deviceId, error)
      }
    }
  }
}

/**
 * Select device and SIM slot for retry
 */
async function selectDeviceForRetry(
  message: any,
  campaign: any
): Promise<{ deviceId: string; simSlot: number }> {
  const socketManager = getSocketManager()
  if (!socketManager) {
    throw new Error('Socket manager not available')
  }

  // Get connected devices
  const connectedDevices = socketManager.getConnectedDevices()

  // If campaign has a device pool, use it; otherwise use all connected devices
  const devicePool = (campaign.devicePool as any) as string[] || []
  const availableDevices = devicePool.length > 0
    ? connectedDevices.filter((d: string) => devicePool.includes(d))
    : connectedDevices

  if (availableDevices.length === 0) {
    throw new Error('No devices available for retry')
  }

  // Select device: prefer original device if available and not circuit-broken
  let selectedDeviceId = message.deviceId

  if (selectedDeviceId && availableDevices.includes(selectedDeviceId)) {
    // Check if original device should be used
    const circuitState = checkCircuitBreaker(selectedDeviceId)
    if (!circuitState.shouldRetry) {
      console.log(`[RetryWorker] Original device ${selectedDeviceId} circuit broken, selecting alternative`)
      selectedDeviceId = null
    }
  }

  // If no device selected, pick one from available devices
  if (!selectedDeviceId || !availableDevices.includes(selectedDeviceId)) {
    // Use round-robin selection from available devices
    const index = Math.floor(Math.random() * availableDevices.length)
    selectedDeviceId = availableDevices[index]
  }

  // Select SIM slot using best performing SIM logic
  const simSlotConfig = (campaign.metadata as any)?.simSlot || 1
  let availableSimSlots = [1]

  if (simSlotConfig === 'both') {
    availableSimSlots = [1, 2]
  } else if (simSlotConfig === 2) {
    availableSimSlots = [2]
  }

  // Use SIM failover logic to select best SIM
  const bestSim = selectBestSim(selectedDeviceId, availableSimSlots)

  return { deviceId: selectedDeviceId, simSlot: bestSim }
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get retry worker status
 */
export function getRetryWorkerStatus(): {
  isRunning: boolean
  isProcessing: boolean
  config: typeof RETRY_WORKER_CONFIG
} {
  return {
    isRunning: retryWorkerInterval !== null,
    isProcessing,
    config: RETRY_WORKER_CONFIG
  }
}