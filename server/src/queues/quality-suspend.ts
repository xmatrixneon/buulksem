import { Queue } from 'bullmq'
import { getRedis } from './redis'

export const SUSPEND_QUEUE_NAME = 'quality-suspend'
export const SUSPEND_CHECK_INTERVAL = 300000 // 5 minutes - check for low quality numbers to suspend
export const SUSPEND_RECOVER_INTERVAL = 600000 // 10 minutes - check for suspended numbers to recover

export const suspendQueue = new Queue(SUSPEND_QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000
    }
  }
})

export async function addSuspendJob(data: any) {
  return await suspendQueue.add('quality-check', data)
}

export async function addRecoveryJob(data: any) {
  return await suspendQueue.add('recovery-check', data)
}

export async function getSuspendStats() {
  const counts = await suspendQueue.getJobCounts()
  return {
    name: SUSPEND_QUEUE_NAME,
    counts,
    workers: await suspendQueue.getWorkersCount()
  }
}
