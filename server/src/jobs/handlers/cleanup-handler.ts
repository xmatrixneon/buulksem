import { prisma } from '../../db/prisma'

const MESSAGE_CLEANUP_ENABLED = process.env.MESSAGE_CLEANUP_ENABLED !== 'false'
const MESSAGE_RETENTION_HOURS = parseInt(process.env.MESSAGE_RETENTION_HOURS || '12')
const MESSAGE_CLEANUP_BATCH_SIZE = parseInt(process.env.MESSAGE_CLEANUP_BATCH_SIZE || '1000')
const MESSAGE_CLEANUP_DRY_RUN = process.env.MESSAGE_CLEANUP_DRY_RUN === 'true'

interface CleanupJobResult {
  success: boolean
  processed?: number
  duration?: number
  details?: {
    totalDeleted?: number
    retentionHours?: number
    cutoffDate?: string
    dryRun?: boolean
  }
  error?: string
}

export async function handleCleanupJob(data: any): Promise<CleanupJobResult> {
  const startTime = Date.now()

  try {
    const { retentionHours = MESSAGE_RETENTION_HOURS, batchSize = MESSAGE_CLEANUP_BATCH_SIZE, dryRun = MESSAGE_CLEANUP_DRY_RUN } = data
    const cutoffDate = new Date(Date.now() - retentionHours * 60 * 60 * 1000)

    console.log(`[Cleanup] Starting: Deleting messages older than ${cutoffDate.toISOString()} (dryRun=${dryRun})`)

    // Count messages first
    console.log(`[Cleanup] Counting messages...`)
    const oldCount = await prisma.message.count({
      where: { time: { lt: cutoffDate } }
    })
    console.log(`[Cleanup] Found ${oldCount} messages to process`)

    if (oldCount === 0) {
      return {
        success: true,
        processed: 0,
        duration: Date.now() - startTime,
        details: {
          retentionHours,
          cutoffDate: cutoffDate.toISOString(),
          totalDeleted: 0,
          dryRun
        }
      }
    }

    let totalDeleted = 0

    if (dryRun) {
      console.log(`[Cleanup] Would delete ${oldCount} messages`)
      totalDeleted = oldCount
    } else {
      let hasMore = true
      while (hasMore) {
        const oldMessages = await prisma.message.findMany({
          where: {
            time: { lt: cutoffDate }
          },
          take: batchSize,
          select: { id: true }
        })

        if (oldMessages.length === 0) {
          hasMore = false
          break
        }

        const deleteResult = await prisma.message.deleteMany({
          where: {
            id: { in: oldMessages.map(m => m.id) }
          }
        })
        totalDeleted += deleteResult.count
        console.log(`[Cleanup] Deleted ${deleteResult.count} messages`)

        // Small delay to avoid overwhelming the database
        if (totalDeleted < oldCount) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }

    return {
      success: true,
      processed: totalDeleted,
      duration: Date.now() - startTime,
      details: {
        retentionHours,
        cutoffDate: cutoffDate.toISOString(),
        totalDeleted,
        dryRun
      }
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
