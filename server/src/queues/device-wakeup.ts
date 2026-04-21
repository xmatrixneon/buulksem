import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const WAKEUP_QUEUE_NAME = 'device-wakeup'
export const WAKEUP_INTERVAL = 120000 // 2 minutes

export const wakeupQueue = new Queue(WAKEUP_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000
    }
  }
})

export async function addWakeupJob(data: any = {}) {
  return await wakeupQueue.add('device-wakeup', data, {
    jobId: `wakeup-${Date.now()}`
  })
}

export async function getWakeupStats() {
  const counts = await wakeupQueue.getJobCounts()
  return {
    name: WAKEUP_QUEUE_NAME,
    counts,
    workers: await wakeupQueue.getWorkersCount()
  }
}
