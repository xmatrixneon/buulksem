/**
 * Job Options Configuration
 *
 * Provides centralized configuration for BullMQ job options,
 * worker concurrency, and intervals.
 */

import { getRedis } from '../../queues/redis'

/**
 * Job options configuration for each queue type
 */
export const jobOptions: Record<string, { attempts: number; backoff: { type: string; delay: number }; removeOnComplete: number; removeOnFail: number }> = {
  'sms-fetch': {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  'device-status': {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 250,
  },
  'device-keepalive': {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  'quality-suspend': {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
    removeOnComplete: 20,
    removeOnFail: 100,
  },
  'maintenance-cleanup': {
    attempts: 1,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  'device-wakeup': {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
}

/**
 * Get job options for a specific queue
 */
export function getJobOptions(queueName: string) {
  return jobOptions[queueName] || {}
}

/**
 * Common queue connection options
 */
export function getQueueOptions() {
  return {
    connection: getRedis(),
  }
}

/**
 * Worker concurrency configuration from env
 * @param queueName - Name of the queue
 * @param defaultConcurrency - Default concurrency if env var not set
 */
export function getWorkerConcurrency(queueName: string, defaultConcurrency = 1): number {
  const envVar = `BULLMQ_CONCURRENCY_${queueName.replace('-', '_').toUpperCase()}`
  return parseInt(process.env[envVar] || String(defaultConcurrency), 10)
}

/**
 * Job intervals from env (milliseconds)
 * @param queueName - Name of the queue
 * @param defaultInterval - Default interval if env var not set
 */
export function getJobInterval(queueName: string, defaultInterval: number): number {
  const envVar = `BULLMQ_${queueName.replace('-', '_').toUpperCase()}_INTERVAL`
  return parseInt(process.env[envVar] || String(defaultInterval), 10)
}
