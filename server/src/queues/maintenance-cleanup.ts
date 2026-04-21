import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const CLEANUP_QUEUE_NAME = 'maintenance-cleanup'
export const CLEANUP_INTERVAL = 300000 // 5 minutes

export const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: 'fixed',
      delay: 60000
    }
  }
})

export async function addCleanupJob(data: any = {}) {
  return await cleanupQueue.add('message-cleanup', data)
}

export async function getCleanupStats() {
  const counts = await cleanupQueue.getJobCounts()
  return {
    name: CLEANUP_QUEUE_NAME,
    counts,
    workers: await cleanupQueue.getWorkersCount()
  }
}
