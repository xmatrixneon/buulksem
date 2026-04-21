import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const FETCH_QUEUE_NAME = 'sms-fetch'
export const FETCH_INTERVAL = 5000 // 5 seconds

export const fetchQueue = new Queue(FETCH_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000
    }
  }
})

export async function addFetchJob(data: any = {}) {
  return await fetchQueue.add('sms-fetch', data, {
    jobId: `fetch-${Date.now()}`
  })
}

export async function getFetchStats() {
  const counts = await fetchQueue.getJobCounts()
  return {
    name: FETCH_QUEUE_NAME,
    counts,
    workers: await fetchQueue.getWorkersCount()
  }
}
