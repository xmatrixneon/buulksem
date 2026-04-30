/**
 * Wakeup Worker
 *
 * Sends FCM wake-up notifications to Android devices that haven't been seen recently.
 * Helps maintain device connectivity and real-time communication.
 */

// Load environment variables first
import dotenv from 'dotenv'
dotenv.config({ path: '/var/www/manager/buulksem/server/.env' })

import { Worker } from 'bullmq'
import { getRedis } from '../queues/redis'
import { wakeupQueue, WAKEUP_INTERVAL } from '../queues/device-wakeup'
import { handleWakeupJob } from '../jobs/handlers/wakeup-handler'
import { withJobLogging } from '../jobs/utils/job-logger'
import { getWorkerConcurrency } from '../jobs/utils/job-options'

// Delay to use when scheduling next job after a failure (to prevent rapid retry loops)
const ERROR_RETRY_DELAY = parseInt(process.env.BULLMQ_ERROR_RETRY_DELAY || '30000', 10)

// Global error handlers to prevent worker crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Wakeup] Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - let PM2 restart if needed
})

process.on('uncaughtException', (error) => {
  console.error('[Wakeup] Uncaught Exception:', error)
  // Exit to let PM2 restart with clean state
  process.exit(1)
})

// Check if worker is enabled
if (process.env.BULLMQ_WAKEUP_ENABLED !== 'true') {
  console.log('[Wakeup Worker] Disabled (BULLMQ_WAKEUP_ENABLED != true)')
  process.exit(0)
}

const worker = new Worker(
  wakeupQueue.name,
  async (job) => {
    return withJobLogging(job, async () => {
      const result = await handleWakeupJob(job.data)

      // Schedule next run for scheduled jobs (regardless of success/failure)
      if (job.data.type === 'scheduled') {
        // Use longer delay on failure to prevent rapid retry loops
        const delay = result.success ? WAKEUP_INTERVAL : ERROR_RETRY_DELAY
        await wakeupQueue.add(
          'device-wakeup',
          {
            type: 'scheduled',
            runId: crypto.randomUUID(),
            startedAt: Date.now(),
          },
          { delay }
        )
      }

      return result
    })
  },
  {
    connection: getRedis(),
    concurrency: getWorkerConcurrency('device-wakeup', 2),
  }
)

worker.on('completed', (job) => {
  console.log(`[Wakeup] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[Wakeup] Job ${job?.id} failed:`, err.message)
})

worker.on('error', (error) => {
  console.error('[Wakeup] Worker error:', error.message)
  // Continue processing other jobs
})

// Graceful shutdown
const shutdown = async () => {
  console.log('[Wakeup] Shutting down worker...')
  await worker.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('[Wakeup] Worker started')

export { worker }
