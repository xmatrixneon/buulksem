import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const STATUS_QUEUE_NAME = 'device-status'
export const STATUS_INTERVAL = 15000 // 15 seconds

export const statusQueue = new Queue(STATUS_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
})

export async function addStatusJob(data: any = {}) {
  return await statusQueue.add('device-status', data, {
    jobId: `status-${Date.now()}`
  })
}

export async function getStatusStats() {
  const counts = await statusQueue.getJobCounts()
  return {
    name: STATUS_QUEUE_NAME,
    counts,
    workers: await statusQueue.getWorkersCount()
  }
}
