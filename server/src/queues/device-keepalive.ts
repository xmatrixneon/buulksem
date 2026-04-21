import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const KEEPALIVE_QUEUE_NAME = 'device-keepalive'
export const KEEPALIVE_INTERVAL = 30000 // 30 seconds

export const keepaliveQueue = new Queue(KEEPALIVE_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000
    }
  }
})

export async function addKeepaliveJob(data: any = {}) {
  return await keepaliveQueue.add('device-keepalive', data, {
    jobId: `keepalive-${Date.now()}`
  })
}

export async function getKeepaliveStats() {
  const counts = await keepaliveQueue.getJobCounts()
  return {
    name: KEEPALIVE_QUEUE_NAME,
    counts,
    workers: await keepaliveQueue.getWorkersCount()
  }
}
