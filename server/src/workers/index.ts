/**
 * BullMQ Workers Entry Point
 *
 * Starts all workers for the SMS Gateway system.
 * Each worker checks its own enabled/disabled flag before starting.
 *
 * Worker Enable/Disable Environment Variables:
 * - BULLMQ_WAKEUP_ENABLED=true/false
 * - BULLMQ_STATUS_ENABLED=true/false
 * - BULLMQ_CLEANUP_ENABLED=true/false
 * - BULLMQ_FETCH_ENABLED=true/false
 * - BULLMQ_KEEPALIVE_ENABLED=true/false
 * - SMS_AUTO_SUSPEND_ENABLED=false/true (inverted logic)
 */

import "dotenv/config"
import { worker as wakeupWorker } from './wakeup-worker'
import { worker as statusWorker } from './status-worker'
import { worker as cleanupWorker } from './cleanup-worker'
import { worker as fetchWorker } from './fetch-worker'
import { worker as keepaliveWorker } from './keepalive-worker'
import { worker as suspendWorker } from './suspend-worker'
import { startRetryWorker, stopRetryWorker } from './retry-worker'

// Global error handlers to prevent worker crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Workers] Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - let PM2 restart if needed
})

process.on('uncaughtException', (error) => {
  console.error('[Workers] Uncaught Exception:', error)
  // Exit to let PM2 restart with clean state
  process.exit(1)
})

console.log('🚀 Starting BullMQ Workers...')

// Store workers for graceful shutdown
const workers = [
  wakeupWorker,
  statusWorker,
  cleanupWorker,
  fetchWorker,
  keepaliveWorker,
  suspendWorker
]

console.log(`✅ Started ${workers.length} workers:`)
console.log('  - Device Wakeup Worker')
console.log('  - Device Status Worker')
console.log('  - Maintenance Cleanup Worker')
console.log('  - SMS Fetch Worker')
console.log('  - Device Keepalive Worker')
console.log('  - Quality Suspend Worker')

// Start retry worker (non-BullMQ interval-based worker)
startRetryWorker()
console.log('  - SMS Retry Worker (with exponential backoff)')

console.log('📡 Workers are now processing jobs...')

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down workers...')

  // Stop retry worker
  stopRetryWorker()

  // Close BullMQ workers
  await Promise.all(workers.map(worker => worker.close()))

  console.log('✅ All workers stopped')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { workers }
