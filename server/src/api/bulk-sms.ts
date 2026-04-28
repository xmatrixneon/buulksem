import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '../db/prisma'
import { getSocketManager } from '../websocket/manager'
import {
  checkCircuitBreaker,
  recordCircuitFailure,
  recordCircuitSuccess,
  selectBestSim,
  updateSimPerformance,
  classifyError,
  calculateBackoffDelay
} from '../lib/retry-utils'
import {
  canDeviceSendSMS,
  incrementDeviceSMSCount,
  getDeviceSMSCount,
  getDeviceTier
} from '../lib/daily-counter'
import {
  validateMessage,
  getMessageInfo,
  getMessageSegments,
  calculateCostSegments
} from '../lib/sms-encoding'

/**
 * Bulk SMS API Functions
 *
 * Features:
 * - Create bulk SMS campaigns
 * - Send bulk SMS to multiple recipients
 * - Track delivery status
 * - Campaign management
 * - Device pool management
 */

// Input schemas
export const createCampaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1).max(1600), // Max 10 segments UCS-2 (67 × 10 = 670, but 1600 allows room for Unicode)
  recipients: z.array(z.string().min(10)), // Array of phone numbers
  devicePool: z.array(z.string()).optional(), // Device IDs to use (optional - auto-select if not provided)
  strategy: z.enum(['round-robin', 'load-balanced', 'priority']).default('round-robin'),
  scheduledAt: z.string().datetime().optional(), // ISO datetime for scheduled sending
  webhookUrl: z.string().url().optional(),
  simSlot: z.any().default('both'), // SIM slot: 1, 2, or 'both'
}).refine(
  (input) => {
    const validation = validateMessage(input.message, 10)
    return validation.valid
  },
  {
    message: 'Message exceeds maximum length (10 segments / ~670 chars for UCS-2 or ~1530 chars for GSM-7)',
    path: ['message']
  }
)

// Helper: Select device from pool based on strategy with circuit breaker, SIM failover, and daily limit checking
async function selectDevice(
  devicePool: string[] | undefined,
  strategy: string,
  currentIndex: number,
  useBothSims: boolean = false
): Promise<{ deviceId: string; simSlot: number }> {
  const socketManager = getSocketManager()
  if (!socketManager) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Socket manager not available',
    })
  }

  // Get connected devices (cluster-aware)
  const connectedDevices = await socketManager.getOnlineDevices()

  // Filter devices by device pool if provided, otherwise use all connected devices
  const availableDevices = devicePool
    ? connectedDevices.filter((d) => devicePool.includes(d))
    : connectedDevices

  if (availableDevices.length === 0) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No devices available',
    })
  }

  // Check circuit breakers AND daily limits for all devices
  const healthyDevices: string[] = []
  for (const deviceId of availableDevices) {
    const circuitState = checkCircuitBreaker(deviceId)
    if (circuitState.shouldRetry) {
      // Check daily SMS limit
      const canSend = await canDeviceSendSMS(deviceId)
      if (canSend) {
        healthyDevices.push(deviceId)
      } else {
        console.log(`[SelectDevice] Device ${deviceId} reached daily limit, skipping`)
      }
    } else {
      console.log(`[SelectDevice] Device ${deviceId} circuit broken, skipping`)
    }
  }

  const candidateDevices = healthyDevices.length > 0 ? healthyDevices : availableDevices

  // Select device based on strategy with tiering support
  let deviceId: string

  switch (strategy) {
    case 'round-robin':
      deviceId = candidateDevices[currentIndex % candidateDevices.length]!
      break
    case 'load-balanced':
      // Select device with least messages TODAY (using Redis daily counter)
      // This prioritizes fresh devices (tier 1) over near-limit devices (tier 3)
      const deviceTiers = await Promise.all(
        candidateDevices.map(async (d) => {
          const tier = await getDeviceTier(d)
          return {
            deviceId: d,
            tier: tier.tier,
            usage: tier.usage,
            remaining: tier.remaining,
          }
        })
      )

      // Sort by: lowest tier first, then lowest usage within same tier
      deviceTiers.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier
        return a.usage - b.usage
      })

      deviceId = deviceTiers[0]?.deviceId || candidateDevices[0]!
      const selectedTier = deviceTiers[0]!
      console.log(`[SelectDevice] Load-balanced selected device ${deviceId} (tier ${selectedTier.tier}, usage: ${selectedTier.usage}/${selectedTier.usage + (selectedTier.remaining || 0)})`)
      break
    case 'priority':
      // Use first device in pool
      deviceId = candidateDevices[0]!
      break
    default:
      deviceId = candidateDevices[0]!
  }

  // Select SIM slot using SIM failover logic
  let availableSimSlots = [1]
  if (useBothSims) {
    availableSimSlots = [1, 2]
  }

  // Use SIM performance metrics to select best SIM
  const simSlot = selectBestSim(deviceId, availableSimSlots)

  // Increment device daily counter after selection
  const newCount = await incrementDeviceSMSCount(deviceId)
  console.log(`[SelectDevice] Selected device ${deviceId} via SIM ${simSlot} (strategy: ${strategy}, daily count: ${newCount}/100)`)

  return { deviceId, simSlot }
}

// Helper: Calculate campaign statistics
async function calculateCampaignStats(campaignId: string) {
  const messages = await prisma.bulkMessage.findMany({
    where: { campaignId },
  })

  return {
    totalRecipients: messages.length,
    sentCount: messages.filter((m) => m.status === 'sent').length,
    deliveredCount: messages.filter((m) => m.status === 'delivered').length,
    failedCount: messages.filter((m) => m.status === 'failed').length,
    pendingCount: messages.filter((m) => m.status === 'pending' || m.status === 'queued').length,
  }
}

/**
 * Create a new bulk SMS campaign
 */
export async function createCampaign({ input, ctx }: { input: any; ctx: any }) {
  const socketManager = getSocketManager()
  if (!socketManager) {
    console.error('[BulkSMS] Socket manager not available')
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Socket manager not available',
    })
  }

  // Use cluster-aware method to get all online devices
  const connectedDevices = await socketManager.getOnlineDevices()
  console.log(`[BulkSMS] Creating campaign "${input.name}"`)
  console.log(`[BulkSMS] Online devices (cluster-aware): ${connectedDevices.length > 0 ? connectedDevices.join(', ') : 'NONE'}`)
  console.log(`[BulkSMS] Requested device pool: ${input.devicePool?.length || 0} devices`)

  // Validate device pool if provided
  if (input.devicePool && input.devicePool.length > 0) {
    const availableDevices = input.devicePool.filter((d: string) =>
      connectedDevices.includes(d)
    )

    console.log(`[BulkSMS] Available devices in pool: ${availableDevices.length > 0 ? availableDevices.join(', ') : 'NONE'}`)

    if (availableDevices.length === 0) {
      console.error(`[BulkSMS] No online devices in pool. Requested: [${input.devicePool.join(', ')}], Online: [${connectedDevices.join(', ') || 'NONE'}]`)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `No connected devices found in device pool. ${connectedDevices.length > 0 ? `Online devices: ${connectedDevices.join(', ')}` : 'No devices are currently online.'}`,
      })
    }
  } else if (connectedDevices.length === 0) {
    console.error('[BulkSMS] No devices online and no device pool specified')
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No devices are currently online. Please connect at least one device.',
    })
  }

  // Create campaign
  const campaign = await prisma.bulkCampaign.create({
    data: {
      name: input.name,
      message: input.message,
      totalRecipients: input.recipients.length,
      status: 'pending',
      devicePool: input.devicePool || [],
      strategy: input.strategy,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      webhookUrl: input.webhookUrl,
      metadata: {
        simSlot: input.simSlot,
      },
    },
  })

  // Create individual messages
  // For 'both' SIM slot, we'll assign SIM slots during processing
  const initialSimSlot = input.simSlot === 'both' ? 1 : input.simSlot
  const messages = await Promise.all(
    input.recipients.map((recipientNumber: string) =>
      prisma.bulkMessage.create({
        data: {
          campaignId: campaign.id,
          recipientNumber,
          message: input.message,
          status: 'pending',
          simSlot: initialSimSlot,
        },
      })
    )
  )

  // If not scheduled, start processing immediately
  if (!input.scheduledAt) {
    // Start processing in background
    processCampaign(campaign.id).catch((error) => {
      console.error(`Error processing campaign ${campaign.id}:`, error)
    })
  }

  // Calculate message encoding info
  const messageInfo = getMessageInfo(input.message)

  return {
    campaignId: campaign.id,
    name: campaign.name,
    totalRecipients: campaign.totalRecipients,
    status: campaign.status,
    messageInfo: {
      encoding: messageInfo.encoding,
      segments: messageInfo.segments,
      length: messageInfo.length,
      costSegments: calculateCostSegments(input.message, input.recipients.length),
      description: messageInfo.encodingDescription
    },
    message: 'Campaign created successfully',
  }
}

/**
 * Get campaign status
 */
export async function getCampaignStatus({ input, ctx }: { input: any; ctx: any }) {
  const campaign = await prisma.bulkCampaign.findUnique({
    where: { id: input.campaignId },
  })

  if (!campaign) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Campaign not found',
    })
  }

  const stats = await calculateCampaignStats(input.campaignId)

  // Get recent messages
  const recentMessages = await prisma.bulkMessage.findMany({
    where: { campaignId: input.campaignId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      strategy: campaign.strategy,
      scheduledAt: campaign.scheduledAt,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      createdAt: campaign.createdAt,
    },
    stats: {
      totalRecipients: stats.totalRecipients,
      sentCount: stats.sentCount,
      deliveredCount: stats.deliveredCount,
      failedCount: stats.failedCount,
      pendingCount: stats.pendingCount,
    },
    recentMessages: recentMessages.map((m) => ({
      id: m.id,
      recipientNumber: m.recipientNumber,
      status: m.status,
      deviceId: m.deviceId,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      failedAt: m.failedAt,
      failureReason: m.failureReason,
    })),
  }
}

/**
 * Cancel a campaign
 */
export async function cancelCampaign({ input, ctx }: { input: any; ctx: any }) {
  const campaign = await prisma.bulkCampaign.findUnique({
    where: { id: input.campaignId },
  })

  if (!campaign) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Campaign not found',
    })
  }

  if (campaign.status === 'completed' || campaign.status === 'cancelled') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Campaign already ${campaign.status}`,
    })
  }

  // Update campaign status
  await prisma.bulkCampaign.update({
    where: { id: input.campaignId },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
    },
  })

  // Cancel pending messages
  await prisma.bulkMessage.updateMany({
    where: {
      campaignId: input.campaignId,
      status: { in: ['pending', 'queued'] },
    },
    data: {
      status: 'failed',
      failedAt: new Date(),
      failureReason: 'Campaign cancelled',
    },
  })

  return {
    success: true,
    message: 'Campaign cancelled successfully',
  }
}

/**
 * Get message status
 */
export async function getMessageStatus({ input, ctx }: { input: any; ctx: any }) {
  const where: any = { campaignId: input.campaignId }

  if (input.messageId) {
    where.id = input.messageId
  }

  const messages = await prisma.bulkMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: input.messageId ? 1 : 100,
  })

  return {
    messages: messages.map((m) => ({
      id: m.id,
      recipientNumber: m.recipientNumber,
      status: m.status,
      deviceId: m.deviceId,
      simSlot: m.simSlot,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      failedAt: m.failedAt,
      failureReason: m.failureReason,
      retryCount: m.retryCount,
    })),
  }
}

/**
 * List all campaigns
 */
export async function listCampaigns({ input, ctx }: { input: any; ctx: any }) {
  const where = input.status ? { status: input.status } : {}

  const campaigns = await prisma.bulkCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: input.limit,
    skip: input.offset,
  })

  const total = await prisma.bulkCampaign.count({ where })

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      deliveredCount: c.deliveredCount,
      failedCount: c.failedCount,
      strategy: c.strategy,
      scheduledAt: c.scheduledAt,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
    })),
    total,
    limit: input.limit,
    offset: input.offset,
  }
}

/**
 * Process campaign in background with parallel message processing
 * This function distributes messages across devices and processes them in parallel
 */
async function processCampaign(campaignId: string) {
  const socketManager = getSocketManager()
  if (!socketManager) {
    throw new Error('Socket manager not available')
  }

  try {
    // Update campaign status
    await prisma.bulkCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    })

    // Get campaign details
    const campaign = await prisma.bulkCampaign.findUnique({
      where: { id: campaignId },
    })

    if (!campaign) {
      throw new Error('Campaign not found')
    }

    // Get pending messages
    const messages = await prisma.bulkMessage.findMany({
      where: {
        campaignId,
        status: { in: ['pending'] },
      },
    })

    const devicePool = (campaign.devicePool as any) as string[] | undefined
    const strategy = campaign.strategy
    const simSlotConfig = (campaign.metadata as any)?.simSlot || 1
    const useBothSims = simSlotConfig === 'both'

    // STEP 1: Distribute messages across devices using round-robin assignment
    // This ensures even distribution before parallel processing
    const deviceAssignments: Map<string, Array<typeof messages[0]>> = new Map()
    const socketDevices = await socketManager.getOnlineDevices()
    const availableDevices = devicePool
      ? socketDevices.filter((d) => devicePool.includes(d))
      : socketDevices

    if (availableDevices.length === 0) {
      console.error(`[Campaign ${campaignId}] No devices available. Device pool: [${devicePool?.join(', ') || 'ALL'}], Online: [${socketDevices.join(', ') || 'NONE'}]`)
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No devices available for campaign',
      })
    }

    console.log(`[Campaign ${campaignId}] Distributing ${messages.length} messages across ${availableDevices.length} devices: ${availableDevices.join(', ')}`)

    // Distribute messages round-robin across devices
    messages.forEach((message, index) => {
      const deviceIndex = index % availableDevices.length
      const deviceId = availableDevices[deviceIndex]!

      if (!deviceAssignments.has(deviceId)) {
        deviceAssignments.set(deviceId, [])
      }
      deviceAssignments.get(deviceId)!.push(message)
    })

    // Log distribution
    deviceAssignments.forEach((deviceMessages, deviceId) => {
      console.log(`[Campaign ${campaignId}] Device ${deviceId} assigned ${deviceMessages.length} messages`)
    })

    // STEP 2: Process each device's messages in parallel
    // Each device processes its messages sequentially with rate limiting
    const processingPromises = Array.from(deviceAssignments.entries()).map(
      ([deviceId, deviceMessages]) =>
        processDeviceMessages(deviceId, deviceMessages, campaignId, strategy, useBothSims, socketManager)
    )

    // Wait for all devices to complete processing
    await Promise.all(processingPromises)

    console.log(`[Campaign ${campaignId}] All devices completed processing`)

    // Update campaign status
    const stats = await calculateCampaignStats(campaignId)
    await prisma.bulkCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        sentCount: stats.sentCount,
        deliveredCount: stats.deliveredCount,
        failedCount: stats.failedCount,
      },
    })

    // Send webhook if provided
    if (campaign.webhookUrl) {
      // TODO: Implement webhook notification
      console.log(`Webhook notification to ${campaign.webhookUrl}`)
    }
  } catch (error) {
    // Mark campaign as failed
    await prisma.bulkCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    })
    throw error
  }
}

/**
 * Process messages for a single device sequentially with rate limiting
 * This function is called in parallel for each device
 */
async function processDeviceMessages(
  deviceId: string,
  messages: any[],
  campaignId: string,
  strategy: string,
  useBothSims: boolean,
  socketManager: ReturnType<typeof getSocketManager>
) {
  console.log(`[Campaign ${campaignId}] Device ${deviceId} starting to process ${messages.length} messages`)

  let successCount = 0
  let failureCount = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const deviceIndex = i // Use local index for this device's messages

    try {
      // Check if device can still send SMS (daily limit)
      const canSend = await canDeviceSendSMS(deviceId)
      if (!canSend) {
        console.log(`[Campaign ${campaignId}] Device ${deviceId} reached daily limit, skipping remaining ${messages.length - i} messages`)
        // Mark remaining messages as failed
        for (let j = i; j < messages.length; j++) {
          await prisma.bulkMessage.update({
            where: { id: messages[j].id },
            data: {
              status: 'failed',
              failedAt: new Date(),
              failureReason: 'Device daily limit reached',
            },
          })
          failureCount++
        }
        break
      }

      // Select SIM slot using SIM failover logic
      let availableSimSlots = [1]
      if (useBothSims) {
        availableSimSlots = [1, 2]
      }

      // Use SIM performance metrics to select best SIM
      const simSlot = selectBestSim(deviceId, availableSimSlots)

      // Update message with assigned SIM slot and device
      await prisma.bulkMessage.update({
        where: { id: message.id },
        data: { simSlot, deviceId },
      })

      // Increment device daily counter
      const newCount = await incrementDeviceSMSCount(deviceId)
      console.log(`[Campaign ${campaignId}] Device ${deviceId} daily count: ${newCount}/100`)

      // Calculate message encoding info
      const segmentInfo = getMessageSegments(message.message)

      // Send SMS command to device
      if (!socketManager) {
        throw new Error('Socket manager not available')
      }

      const success = socketManager.sendToDevice(
        deviceId,
        'send_sms',
        {
          messageId: `bulk_${campaignId}_${message.id}`,
          phoneNumber: message.recipientNumber,
          message: message.message,
          simSlot,
          metadata: {
            campaignId,
            bulkMessageId: message.id,
            encoding: segmentInfo.encoding,
            segments: segmentInfo.segments,
            segmentIndex: 0,
          },
        }
      )

      if (success) {
        // Update message status
        await prisma.bulkMessage.update({
          where: { id: message.id },
          data: {
            status: 'queued',
            sentAt: new Date(),
          },
        })

        // Update campaign sent count
        await prisma.bulkCampaign.update({
          where: { id: campaignId },
          data: {
            sentCount: { increment: 1 },
          },
        })

        // Record circuit breaker success
        recordCircuitSuccess(deviceId)

        successCount++
        console.log(`[Campaign ${campaignId}] Device ${deviceId} queued message ${message.id} (${successCount}/${messages.length}) via SIM ${simSlot}`)
      } else {
        throw new Error('Device not responding')
      }

      // Rate limiting: wait 500ms between messages to avoid carrier blocking
      if (i < messages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch (error) {
      // Classify error
      const errorClassification = classifyError(error instanceof Error ? error : (error as string | null))

      // Record circuit breaker failure if device-related
      if (error instanceof Error && (error.message.includes('Device') || error.message.includes('Socket'))) {
        recordCircuitFailure(deviceId, error)
      }

      // Mark message as failed
      const shouldMarkAsFailed = !errorClassification.isRetriable || message.retryCount >= 3

      await prisma.bulkMessage.update({
        where: { id: message.id },
        data: {
          status: shouldMarkAsFailed ? 'failed' : 'pending',
          failedAt: shouldMarkAsFailed ? new Date() : null,
          failureReason: shouldMarkAsFailed ? (error instanceof Error ? error.message : 'Unknown error') : null,
          retryCount: { increment: 1 },
        },
      })

      failureCount++
      console.log(`[Campaign ${campaignId}] Device ${deviceId} message ${message.id} failed: ${errorClassification.reason} (retriable: ${errorClassification.isRetriable})`)
    }
  }

  console.log(`[Campaign ${campaignId}] Device ${deviceId} completed: ${successCount} sent, ${failureCount} failed`)
}
