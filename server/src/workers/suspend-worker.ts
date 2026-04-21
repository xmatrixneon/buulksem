/**
 * Suspend Worker
 *
 * Manages phone number quality-based suspension and recovery.
 * Alternates between:
 * - Suspend check: Suspends low-quality numbers
 * - Recovery check: Recovers suspended numbers that have improved
 */

import { Worker } from 'bullmq'
import { getRedis } from '../queues/redis'
import { suspendQueue, SUSPEND_CHECK_INTERVAL, SUSPEND_RECOVER_INTERVAL } from '../queues/quality-suspend'
import { handleSuspendJob } from '../jobs/handlers/suspend-handler'
import { withJobLogging } from '../jobs/utils/job-logger'
import { getWorkerConcurrency } from '../jobs/utils/job-options'

// Delay to use when scheduling next job after a failure (to prevent rapid retry loops)
const ERROR_RETRY_DELAY = parseInt(process.env.BULLMQ_ERROR_RETRY_DELAY || '30000', 10)

// Global error handlers to prevent worker crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Suspend] Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - let PM2 restart if needed
})

process.on('uncaughtException', (error) => {
  console.error('[Suspend] Uncaught Exception:', error)
  // Exit to let PM2 restart with clean state
  process.exit(1)
})

// Check if worker is enabled
if (process.env.SMS_AUTO_SUSPEND_ENABLED === 'false') {
  console.log('[Suspend Worker] Disabled (SMS_AUTO_SUSPEND_ENABLED == false)')
  process.exit(0)
}

// Schedule initial job if queue is empty (wrapped in async IIFE)
;(async () => {
  const delayedCount = await suspendQueue.getDelayedCount()
  if (delayedCount === 0) {
    await suspendQueue.add(
      'quality-suspend',
      {
        type: 'suspend-check',
        subType: 'suspend-check',
        runId: crypto.randomUUID(),
        startedAt: Date.now(),
      },
      { delay: SUSPEND_CHECK_INTERVAL }
    )
    console.log('[Suspend] Initial job scheduled')
  }
})().catch(console.error)

const worker = new Worker(
  suspendQueue.name,
  async (job) => {
    return withJobLogging(job, async () => {
      const result = await handleSuspendJob(job.data)

      // Schedule next run based on type (alternate between suspend and recovery)
      // Continue regardless of success/failure to prevent worker from stopping
      const currentType = job.data.type || 'suspend-check'
      const nextType = currentType === 'suspend-check' ? 'recovery-check' : 'suspend-check'
      const nextInterval = nextType === 'suspend-check' ? SUSPEND_CHECK_INTERVAL : SUSPEND_RECOVER_INTERVAL

      // Use longer delay on failure to prevent rapid retry loops
      const delay = result.success ? nextInterval : ERROR_RETRY_DELAY

      await suspendQueue.add(
        'quality-suspend',
        {
          type: nextType,
          subType: nextType,
          runId: crypto.randomUUID(),
          startedAt: Date.now(),
        },
        { delay }
      )

      return result
    })
  },
  {
    connection: getRedis(),
    concurrency: getWorkerConcurrency('quality-suspend', 1),
  }
)

worker.on('completed', (job) => {
  console.log(`[Suspend] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[Suspend] Job ${job?.id} failed:`, err.message)
})

worker.on('error', (error) => {
  console.error('[Suspend] Worker error:', error.message)
  // Continue processing other jobs
})

// Graceful shutdown
const shutdown = async () => {
  console.log('[Suspend] Shutting down worker...')
  await worker.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('[Suspend] Worker started')

export { worker }
