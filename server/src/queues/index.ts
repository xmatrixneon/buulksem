import { statusQueue } from './device-status'
import { fetchQueue } from './sms-fetch'
import { suspendQueue } from './quality-suspend'
import { cleanupQueue } from './maintenance-cleanup'
import { keepaliveQueue } from './device-keepalive'
import { wakeupQueue } from './device-wakeup'

export function getAllQueues() {
  return [
    statusQueue,
    fetchQueue,
    suspendQueue,
    cleanupQueue,
    keepaliveQueue,
    wakeupQueue
  ]
}

export async function getAllQueueStats() {
  const queues = getAllQueues()
  const stats = await Promise.all(
    queues.map(async (queue) => ({
      name: queue.name,
      counts: await queue.getJobCounts(),
      workers: await queue.getWorkersCount()
    }))
  )
  return stats
}

export async function pauseAllQueues() {
  const queues = getAllQueues()
  await Promise.all(queues.map(queue => queue.pause()))
}

export async function resumeAllQueues() {
  const queues = getAllQueues()
  await Promise.all(queues.map(queue => queue.resume()))
}

export async function obliterateAllQueues() {
  const queues = getAllQueues()
  await Promise.all(queues.map(queue => queue.drain()))
}
