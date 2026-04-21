/**
 * Fetch Worker
 *
 * Fetches SMS messages from Android devices.
 * Retrieves received SMS messages that haven't been forwarded yet.
 */

import { Worker } from 'bullmq'
import { getRedis } from '../queues/redis'
import { fetchQueue, FETCH_INTERVAL } from '../queues/sms-fetch'
import { handleFetchJob } from '../jobs/handlers/fetch-handler'
import { withJobLogging } from '../jobs/utils/job-logger'
import { getWorkerConcurrency } from '../jobs/utils/job-options'

// Delay to use when scheduling next job after a failure (to prevent rapid retry loops)
const ERROR_RETRY_DELAY = parseInt(process.env.BULLMQ_ERROR_RETRY_DELAY || '30000', 10)

// Global error handlers to prevent worker crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fetch] Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - let PM2 restart if needed
})

process.on('uncaughtException', (error) => {
  console.error('[Fetch] Uncaught Exception:', error)
  // Exit to let PM2 restart with clean state
  process.exit(1)
})

// Check if worker is enabled
if (process.env.BULLMQ_FETCH_ENABLED !== 'true') {
  console.log('[Fetch Worker] Disabled (BULLMQ_FETCH_ENABLED != true)')
  process.exit(0)
}

// Schedule initial job if queue is empty (wrapped in async IIFE)
;(async () => {
  const delayedCount = await fetchQueue.getDelayedCount()
  if (delayedCount === 0) {
    await fetchQueue.add(
      'sms-fetch',
      {
        type: 'scheduled',
        runId: crypto.randomUUID(),
        startedAt: Date.now(),
      },
      { delay: FETCH_INTERVAL }
    )
    console.log('[Fetch] Initial job scheduled')
  }
})().catch(console.error)

const worker = new Worker(
  fetchQueue.name,
  async (job) => {
    return withJobLogging(job, async () => {
      const result = await handleFetchJob(job.data)

      // Schedule next run for scheduled jobs (regardless of success/failure)
      if (job.data.type === 'scheduled') {
        // Use longer delay on failure to prevent rapid retry loops
        const delay = result.success ? FETCH_INTERVAL : ERROR_RETRY_DELAY
        await fetchQueue.add(
          'sms-fetch',
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
    concurrency: getWorkerConcurrency('sms-fetch', 1),
  }
)

worker.on('completed', (job) => {
  console.log(`[Fetch] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[Fetch] Job ${job?.id} failed:`, err.message)
})

worker.on('error', (error) => {
  console.error('[Fetch] Worker error:', error.message)
  // Continue processing other jobs
})

// Graceful shutdown
const shutdown = async () => {
  console.log('[Fetch] Shutting down worker...')
  await worker.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log('[Fetch] Worker started')

export { worker }
