/**
 * Retry Utilities for Bulk SMS System
 *
 * Features:
 * - Exponential backoff with jitter
 * - Error classification (transient vs permanent)
 * - Circuit breaker pattern
 * - SIM failover logic
 */

// Error codes that indicate transient failures (retriable)
const TRANSIENT_ERROR_CODES = [
  'RESULT_ERROR_RADIO_OFF',
  'RESULT_ERROR_NO_SERVICE',
  'RESULT_ERROR_LIMIT_EXCEEDED',
  'Network timeout',
  'Device not responding',
  'Connection lost',
  'Network error',
  'Rate limit exceeded',
  'Temporary failure',
]

// Error codes that indicate permanent failures (non-retriable)
const PERMANENT_ERROR_CODES = [
  'Invalid phone number',
  'Unsupported recipient',
  'Invalid message format',
  'Account suspended',
  'Insufficient credits',
  'Invalid device',
  'Invalid SIM slot',
]

// Circuit breaker state for devices/SIMs
interface CircuitState {
  isOpen: boolean
  failureCount: number
  lastFailureTime: Date
  cooldownUntil: Date
}

const circuitBreakers = new Map<string, CircuitState>()

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // Number of failures before opening circuit
  cooldownPeriod: 300000, // 5 minutes cooldown period (ms)
  halfOpenAttempts: 3, // Number of attempts in half-open state
}

// SIM performance tracking
interface SimPerformance {
  totalSent: number
  totalDelivered: number
  totalFailed: number
  consecutiveFailures: number
  lastSuccessTime?: Date
  lastFailureTime?: Date
}

const simPerformance = new Map<string, SimPerformance>()

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attemptNumber - Current retry attempt (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000ms)
 * @param maxDelayMs - Maximum delay in milliseconds (default: 60000ms)
 * @param jitterFactor - Random jitter factor (default: 0.5)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000,
  jitterFactor: number = 0.5
): number {
  // Calculate exponential backoff: baseDelay * (2^attemptNumber)
  const exponentialDelay = baseDelayMs * Math.pow(2, attemptNumber)

  // Calculate jitter: random value between 0 and (exponentialDelay * jitterFactor)
  const jitter = Math.random() * exponentialDelay * jitterFactor

  // Calculate final delay
  const finalDelay = exponentialDelay + jitter

  // Cap at maximum delay
  return Math.min(finalDelay, maxDelayMs)
}

/**
 * Classify error as transient (retriable) or permanent (non-retriable)
 *
 * @param error - Error message or error object
 * @returns Object with classification and reasoning
 */
export function classifyError(error: string | Error | null): {
  isRetriable: boolean
  errorType: 'transient' | 'permanent' | 'unknown'
  reason: string
} {
  const errorMessage = error instanceof Error ? error.message : error || ''

  if (!errorMessage) {
    return {
      isRetriable: true,
      errorType: 'unknown',
      reason: 'Unknown error, will retry'
    }
  }

  // Check for permanent errors
  const isPermanent = PERMANENT_ERROR_CODES.some(code =>
    errorMessage.toLowerCase().includes(code.toLowerCase())
  )

  if (isPermanent) {
    return {
      isRetriable: false,
      errorType: 'permanent',
      reason: `Permanent error: ${errorMessage}`
    }
  }

  // Check for transient errors
  const isTransient = TRANSIENT_ERROR_CODES.some(code =>
    errorMessage.toLowerCase().includes(code.toLowerCase())
  )

  if (isTransient) {
    return {
      isRetriable: true,
      errorType: 'transient',
      reason: `Transient error: ${errorMessage}`
    }
  }

  // Default to retriable for unknown errors
  return {
    isRetriable: true,
    errorType: 'unknown',
    reason: `Unknown error type: ${errorMessage}, will retry`
  }
}

/**
 * Check if a device should be retried based on circuit breaker state
 *
 * @param deviceId - Device ID to check
 * @returns Object with shouldRetry boolean and circuit state
 */
export function checkCircuitBreaker(deviceId: string): {
  shouldRetry: boolean
  circuitState: CircuitState
} {
  const circuitKey = `device:${deviceId}`
  const state = circuitBreakers.get(circuitKey) || {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: new Date(),
    cooldownUntil: new Date()
  }

  const now = new Date()

  // If circuit is open and cooldown period has passed, move to half-open state
  if (state.isOpen && state.cooldownUntil <= now) {
    // Circuit moves to half-open state (close it temporarily)
    state.isOpen = false
    state.failureCount = 0
    circuitBreakers.set(circuitKey, state)

    return {
      shouldRetry: true,
      circuitState: state
    }
  }

  // If circuit is open and still in cooldown, don't retry
  if (state.isOpen) {
    return {
      shouldRetry: false,
      circuitState: state
    }
  }

  // Circuit is closed, allow retry
  return {
    shouldRetry: true,
    circuitState: state
  }
}

/**
 * Record a failure for circuit breaker
 *
 * @param deviceId - Device ID that failed
 * @param error - Error that occurred
 */
export function recordCircuitFailure(deviceId: string, error: string | Error): void {
  const circuitKey = `device:${deviceId}`
  const state = circuitBreakers.get(circuitKey) || {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: new Date(),
    cooldownUntil: new Date()
  }

  state.failureCount++
  state.lastFailureTime = new Date()

  // If threshold reached, open circuit
  if (state.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    state.isOpen = true
    state.cooldownUntil = new Date(Date.now() + CIRCUIT_BREAKER_CONFIG.cooldownPeriod)

    console.log(`[CircuitBreaker] Circuit opened for device ${deviceId}: ${state.failureCount} consecutive failures, cooling down until ${state.cooldownUntil.toISOString()}`)
  }

  circuitBreakers.set(circuitKey, state)
}

/**
 * Record a success for circuit breaker (resets failure count)
 *
 * @param deviceId - Device ID that succeeded
 */
export function recordCircuitSuccess(deviceId: string): void {
  const circuitKey = `device:${deviceId}`
  const state = circuitBreakers.get(circuitKey)

  if (state) {
    state.failureCount = 0
    state.isOpen = false
    circuitBreakers.set(circuitKey, state)

    console.log(`[CircuitBreaker] Circuit reset for device ${deviceId} after successful operation`)
  }
}

/**
 * Update SIM performance metrics
 *
 * @param deviceId - Device ID
 * @param simSlot - SIM slot number
 * @param success - Whether the operation was successful
 */
export function updateSimPerformance(
  deviceId: string,
  simSlot: number,
  success: boolean
): void {
  const simKey = `${deviceId}:${simSlot}`
  const perf = simPerformance.get(simKey) || {
    totalSent: 0,
    totalDelivered: 0,
    totalFailed: 0,
    consecutiveFailures: 0
  }

  perf.totalSent++

  if (success) {
    perf.totalDelivered++
    perf.consecutiveFailures = 0
    perf.lastSuccessTime = new Date()
  } else {
    perf.totalFailed++
    perf.consecutiveFailures++
    perf.lastFailureTime = new Date()
  }

  simPerformance.set(simKey, perf)
}

/**
 * Get SIM performance metrics
 *
 * @param deviceId - Device ID
 * @param simSlot - SIM slot number
 * @returns Performance metrics for the SIM
 */
export function getSimPerformance(
  deviceId: string,
  simSlot: number
): SimPerformance | undefined {
  const simKey = `${deviceId}:${simSlot}`
  return simPerformance.get(simKey)
}

/**
 * Select best performing SIM for a device
 *
 * @param deviceId - Device ID
 * @param availableSimSlots - Available SIM slots (array of sim numbers)
 * @returns Best performing SIM slot
 */
export function selectBestSim(
  deviceId: string,
  availableSimSlots: number[]
): number {
  if (availableSimSlots.length === 0) {
    throw new Error('No SIM slots available')
  }

  if (availableSimSlots.length === 1) {
    return availableSimSlots[0]!
  }

  // Get performance metrics for all SIMs
  const simMetrics = availableSimSlots.map(simSlot => ({
    simSlot,
    performance: simPerformance.get(`${deviceId}:${simSlot}`)
  }))

  // Sort by success rate, preferring SIMs with:
  // 1. Higher success rate
  // 2. Fewer consecutive failures
  // 3. More recent success
  simMetrics.sort((a, b) => {
    const perfA = a.performance || { totalSent: 0, totalDelivered: 0, consecutiveFailures: 0, lastSuccessTime: undefined }
    const perfB = b.performance || { totalSent: 0, totalDelivered: 0, consecutiveFailures: 0, lastSuccessTime: undefined }

    const successRateA = perfA.totalSent > 0 ? perfA.totalDelivered / perfA.totalSent : 0
    const successRateB = perfB.totalSent > 0 ? perfB.totalDelivered / perfB.totalSent : 0

    // Prefer higher success rate
    if (successRateA !== successRateB) {
      return successRateB - successRateA
    }

    // Prefer fewer consecutive failures
    if (perfA.consecutiveFailures !== perfB.consecutiveFailures) {
      return perfA.consecutiveFailures - perfB.consecutiveFailures
    }

    // Prefer more recent success
    const timeA = perfA.lastSuccessTime?.getTime() || 0
    const timeB = perfB.lastSuccessTime?.getTime() || 0
    return timeB - timeA
  })

  return simMetrics[0]!.simSlot
}

/**
 * Check if message should be retried
 *
 * @param retryCount - Current retry count
 * @param maxRetries - Maximum allowed retries
 * @param error - Error that occurred
 * @returns Object with shouldRetry boolean and reason
 */
export function shouldRetryMessage(
  retryCount: number,
  maxRetries: number,
  error: string | Error | null
): {
  shouldRetry: boolean
  reason: string
  delayMs?: number
} {
  // Check if max retries exceeded
  if (retryCount >= maxRetries) {
    return {
      shouldRetry: false,
      reason: `Max retries (${maxRetries}) exceeded`
    }
  }

  // Classify error
  const errorClassification = classifyError(error)

  if (!errorClassification.isRetriable) {
    return {
      shouldRetry: false,
      reason: errorClassification.reason
    }
  }

  // Calculate delay for retry
  const delayMs = calculateBackoffDelay(retryCount)

  return {
    shouldRetry: true,
    reason: errorClassification.reason,
    delayMs
  }
}

/**
 * Get circuit breaker state for monitoring
 *
 * @returns Array of circuit breaker states
 */
export function getCircuitBreakerStates(): Array<{
  key: string
  state: CircuitState
}> {
  return Array.from(circuitBreakers.entries()).map(([key, state]) => ({
    key,
    state
  }))
}

/**
 * Get SIM performance metrics for monitoring
 *
 * @returns Array of SIM performance metrics
 */
export function getSimPerformanceMetrics(): Array<{
  key: string
  performance: SimPerformance
}> {
  return Array.from(simPerformance.entries()).map(([key, performance]) => ({
    key,
    performance
  }))
}

/**
 * Reset circuit breaker for a specific device (admin function)
 *
 * @param deviceId - Device ID to reset
 */
export function resetCircuitBreaker(deviceId: string): void {
  const circuitKey = `device:${deviceId}`
  circuitBreakers.delete(circuitKey)
  console.log(`[CircuitBreaker] Circuit breaker reset for device ${deviceId}`)
}

/**
 * Reset SIM performance metrics (admin function)
 *
 * @param deviceId - Device ID (optional, resets all if not provided)
 * @param simSlot - SIM slot (optional, resets all if not provided)
 */
export function resetSimPerformance(deviceId?: string, simSlot?: number): void {
  if (!deviceId) {
    simPerformance.clear()
    console.log('[SimPerformance] All SIM performance metrics reset')
  } else if (!simSlot) {
    const keysToDelete = Array.from(simPerformance.keys())
      .filter(key => key.startsWith(`${deviceId}:`))
    keysToDelete.forEach(key => simPerformance.delete(key))
    console.log(`[SimPerformance] SIM performance metrics reset for device ${deviceId}`)
  } else {
    const simKey = `${deviceId}:${simSlot}`
    simPerformance.delete(simKey)
    console.log(`[SimPerformance] SIM performance metrics reset for ${simKey}`)
  }
}