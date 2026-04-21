import { prisma } from '../db/prisma'

/**
 * Dashboard Analytics API
 *
 * Provides analytics endpoints for dashboard panel visualization.
 * No billing/cost features - those are handled in a separate system.
 */

/**
 * Get dashboard summary statistics
 *
 * Returns overall system status for dashboard overview panel
 */
export async function getDashboardSummary(): Promise<{
  today: {
    totalMessages: number
    sentMessages: number
    deliveredMessages: number
    failedMessages: number
    deliveryRate: number
  }
  activeDevices: number
  activeCampaigns: number
  queuedMessages: number
  systemHealth: 'healthy' | 'degraded' | 'critical'
}> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [todayStats, activeDevices, activeCampaigns, queuedMessages, errorCount] = await Promise.all([
    // Today's message stats
    prisma.$transaction(async (tx) => {
      const [total, sent, delivered, failed] = await Promise.all([
        tx.bulkMessage.count({ where: { createdAt: { gte: startOfDay } } }),
        tx.bulkMessage.count({ where: { createdAt: { gte: startOfDay }, status: 'sent' } }),
        tx.bulkMessage.count({ where: { createdAt: { gte: startOfDay }, status: 'delivered' } }),
        tx.bulkMessage.count({ where: { createdAt: { gte: startOfDay }, status: 'failed' } })
      ])

      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0

      return { totalMessages: total, sentMessages: sent, deliveredMessages: delivered, failedMessages: failed, deliveryRate }
    }),

    // Active devices (connected in last 5 minutes)
    prisma.device.count({
      where: {
        lastSeen: { gte: new Date(Date.now() - 5 * 60 * 1000) }
      }
    }),

    // Active campaigns
    prisma.bulkCampaign.count({
      where: { status: { in: ['pending', 'processing'] } }
    }),

    // Queued messages
    prisma.bulkMessage.count({
      where: { status: { in: ['pending', 'queued'] } }
    }),

    // Error count for health check
    prisma.bulkMessage.count({
      where: {
        createdAt: { gte: startOfDay },
        status: 'failed'
      }
    })
  ])

  // Determine system health based on error rate
  const totalToday = todayStats.totalMessages
  const errorRate = totalToday > 0 ? (errorCount / totalToday) * 100 : 0
  const systemHealth = errorRate > 10 ? 'critical' : errorRate > 5 ? 'degraded' : 'healthy'

  return {
    today: {
      totalMessages: todayStats.totalMessages,
      sentMessages: todayStats.sentMessages,
      deliveredMessages: todayStats.deliveredMessages,
      failedMessages: todayStats.failedMessages,
      deliveryRate: todayStats.deliveryRate
    },
    activeDevices,
    activeCampaigns,
    queuedMessages,
    systemHealth
  }
}

/**
 * Get delivery rate over time (hourly for last 24h)
 *
 * Returns hourly breakdown of message delivery rates for trend chart
 */
export async function getDeliveryRateTrend(): Promise<Array<{
  hour: string
  sent: number
  delivered: number
  failed: number
  deliveryRate: number
}>> {
  const now = new Date()
  const hours = []

  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000)
    hourStart.setMinutes(0, 0, 0)
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000)

    const [sent, delivered, failed] = await Promise.all([
      prisma.bulkMessage.count({
        where: {
          sentAt: { gte: hourStart, lt: hourEnd }
        }
      }),
      prisma.bulkMessage.count({
        where: {
          deliveredAt: { gte: hourStart, lt: hourEnd }
        }
      }),
      prisma.bulkMessage.count({
        where: {
          failedAt: { gte: hourStart, lt: hourEnd }
        }
      })
    ])

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0

    hours.push({
      hour: hourStart.getHours().toString().padStart(2, '0') + ':00',
      sent,
      delivered,
      failed,
      deliveryRate
    })
  }

  return hours
}

/**
 * Get device performance comparison
 *
 * Returns per-device statistics sorted by message volume
 */
export async function getDevicePerformance(): Promise<Array<{
  deviceId: string
  name: string
  status: string
  totalMessages: number
  sentMessages: number
  deliveredMessages: number
  failedMessages: number
  deliveryRate: number
  lastSeen: Date
}>> {
  const devices = await prisma.device.findMany({
    where: { isActive: true },
    select: {
      deviceId: true,
      name: true,
      status: true,
      lastSeen: true
    }
  })

  const stats = await Promise.all(
    devices.map(async (device) => {
      const [total, sent, delivered, failed] = await Promise.all([
        prisma.bulkMessage.count({ where: { deviceId: device.deviceId } }),
        prisma.bulkMessage.count({
          where: { deviceId: device.deviceId, status: 'sent' }
        }),
        prisma.bulkMessage.count({
          where: { deviceId: device.deviceId, status: 'delivered' }
        }),
        prisma.bulkMessage.count({
          where: { deviceId: device.deviceId, status: 'failed' }
        })
      ])

      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0

      return {
        deviceId: device.deviceId,
        name: device.name,
        status: device.status,
        totalMessages: total,
        sentMessages: sent,
        deliveredMessages: delivered,
        failedMessages: failed,
        deliveryRate,
        lastSeen: device.lastSeen
      }
    })
  )

  return stats.sort((a, b) => b.totalMessages - a.totalMessages)
}

/**
 * Get error breakdown
 *
 * Returns aggregated error statistics by type and device
 */
export async function getErrorBreakdown(
  timeRange?: { startDate: Date; endDate: Date }
): Promise<{
  totalErrors: number
  errorRate: number
  topErrors: Array<{ reason: string; count: number }>
  errorsByDevice: Array<{ deviceId: string; errorCount: number }>
}> {
  const where = timeRange ? {
    createdAt: {
      gte: timeRange.startDate,
      lte: timeRange.endDate
    }
  } : {}

  const failedMessages = await prisma.bulkMessage.findMany({
    where: { ...where, status: 'failed' },
    select: { failureReason: true, deviceId: true }
  })

  const totalErrors = failedMessages.length
  const totalMessages = await prisma.bulkMessage.count({ where })
  const errorRate = totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0

  // Aggregate by error reason
  const errorMap = new Map<string, number>()
  failedMessages.forEach(msg => {
    const reason = msg.failureReason || 'Unknown error'
    errorMap.set(reason, (errorMap.get(reason) || 0) + 1)
  })

  const topErrors = Array.from(errorMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Aggregate by device
  const deviceMap = new Map<string, number>()
  failedMessages.forEach(msg => {
    if (msg.deviceId) {
      deviceMap.set(msg.deviceId, (deviceMap.get(msg.deviceId) || 0) + 1)
    }
  })

  const errorsByDevice = Array.from(deviceMap.entries())
    .map(([deviceId, errorCount]) => ({ deviceId, errorCount }))
    .sort((a, b) => b.errorCount - a.errorCount)

  return { totalErrors, errorRate, topErrors, errorsByDevice }
}

/**
 * Get throughput metrics (messages per minute for last hour)
 *
 * Returns per-minute message counts for throughput chart
 */
export async function getThroughputMetrics(): Promise<Array<{
  minute: string
  messages: number
}>> {
  const now = new Date()
  const minutes = []

  for (let i = 59; i >= 0; i--) {
    const minuteStart = new Date(now.getTime() - i * 60 * 1000)
    minuteStart.setSeconds(0, 0)
    const minuteEnd = new Date(minuteStart.getTime() + 60 * 1000)

    const count = await prisma.bulkMessage.count({
      where: {
        sentAt: { gte: minuteStart, lt: minuteEnd }
      }
    })

    minutes.push({
      minute: minuteStart.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      messages: count
    })
  }

  return minutes
}

/**
 * Get campaign performance summary
 *
 * Returns list of campaigns with their statistics
 */
export async function getCampaignPerformance(
  limit: number = 20,
  offset: number = 0
): Promise<{
  campaigns: Array<{
    id: string
    name: string
    status: string
    totalRecipients: number
    sentCount: number
    deliveredCount: number
    failedCount: number
    deliveryRate: number
    createdAt: Date
    completedAt: Date | null
  }>
  total: number
}> {
  const [campaigns, total] = await Promise.all([
    prisma.bulkCampaign.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.bulkCampaign.count()
  ])

  const campaignsWithRate = campaigns.map(campaign => ({
    ...campaign,
    deliveryRate: campaign.sentCount > 0
      ? (campaign.deliveredCount / campaign.sentCount) * 100
      : 0
  }))

  return {
    campaigns: campaignsWithRate,
    total
  }
}

/**
 * Get active campaigns (pending or processing)
 *
 * Returns campaigns currently being processed
 */
export async function getActiveCampaigns(): Promise<Array<{
  id: string
  name: string
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  failedCount: number
  startedAt: Date | null
}>> {
  const campaigns = await prisma.bulkCampaign.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: {
      id: true,
      name: true,
      status: true,
      totalRecipients: true,
      sentCount: true,
      deliveredCount: true,
      failedCount: true,
      startedAt: true
    },
    orderBy: { createdAt: 'asc' }
  })

  return campaigns
}

/**
 * Get recent activity log
 *
 * Returns recent messages with their status for activity feed
 */
export async function getRecentActivity(
  limit: number = 50
): Promise<Array<{
  id: string
  recipientNumber: string
  status: string
  sentAt: Date | null
  deliveredAt: Date | null
  failedAt: Date | null
  failureReason: string | null
  deviceId: string | null
  campaign: {
    id: string
    name: string
  } | null
}>> {
  const messages = await prisma.bulkMessage.findMany({
    where: {},
    select: {
      id: true,
      recipientNumber: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      failedAt: true,
      failureReason: true,
      deviceId: true,
      campaign: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })

  return messages
}

/**
 * Export campaign data to CSV
 *
 * Generates CSV export of all messages in a campaign
 */
export async function exportCampaignToCsv(campaignId: string): Promise<string> {
  const campaign = await prisma.bulkCampaign.findUnique({
    where: { id: campaignId },
    include: {
      messages: {
        select: {
          id: true,
          recipientNumber: true,
          status: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
          failureReason: true,
          encoding: true,
          segmentCount: true
        }
      }
    }
  })

  if (!campaign) {
    throw new Error('Campaign not found')
  }

  const headers = [
    'Message ID',
    'Recipient',
    'Status',
    'Sent At',
    'Delivered At',
    'Failed At',
    'Failure Reason',
    'Encoding',
    'Segments'
  ].join(',')

  const rows = campaign.messages.map(msg => [
    msg.id,
    msg.recipientNumber,
    msg.status,
    msg.sentAt?.toISOString() || '',
    msg.deliveredAt?.toISOString() || '',
    msg.failedAt?.toISOString() || '',
    msg.failureReason || '',
    msg.encoding || '',
    msg.segmentCount || ''
  ].map(field => `"${field}"`).join(','))

  return [headers, ...rows].join('\n')
}
