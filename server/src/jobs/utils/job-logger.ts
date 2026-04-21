/**
 * Job Logging Utilities
 *
 * Provides consistent logging wrapper for BullMQ jobs with timing,
 * error tracking, and structured output.
 */

import { Job } from 'bullmq'

/**
 * Wrap a job handler with consistent logging
 * Tracks start time, duration, and provides structured output
 */
export async function withJobLogging<T>(
  job: Job,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  const jobId = job.id
  const queueName = job.queueName
  const jobType = job.data?.type || 'unknown'

  console.log(`[${queueName}] Starting job ${jobId} (${jobType})`)

  try {
    const result = await fn()
    const duration = Date.now() - startTime

    console.log(`[${queueName}] Job ${jobId} completed in ${duration}ms`, {
      processed: (result as any)?.processed,
      errors: (result as any)?.errors,
      success: (result as any)?.success,
    })

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${queueName}] Job ${jobId} failed after ${duration}ms: ${message}`)
    throw error
  }
}

/**
 * Log job start
 */
export function logJobStart(
  queueName: string,
  jobId: string | number,
  data: Record<string, unknown>
): void {
  console.log(`[${queueName}] Job ${jobId} started`, {
    type: data.type,
    runId: data.runId,
  })
}

/**
 * Log job completion
 */
export function logJobComplete(
  queueName: string,
  jobId: string | number,
  result: Record<string, unknown>,
  duration: number
): void {
  console.log(`[${queueName}] Job ${jobId} completed in ${duration}ms`, {
    success: result.success,
    processed: result.processed,
    errors: result.errors,
  })
}

/**
 * Log job error
 */
export function logJobError(
  queueName: string,
  jobId: string | number,
  error: Error,
  duration: number
): void {
  console.error(`[${queueName}] Job ${jobId} failed after ${duration}ms:`, {
    error: error.message,
    stack: error.stack,
  })
}
