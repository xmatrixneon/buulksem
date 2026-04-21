/**
 * Cache Module
 *
 * Redis-based caching utilities for API responses and data.
 * Provides get-or-fetch pattern with automatic TTL.
 */

import { getRedis } from '../queues/redis'

const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false'

/**
 * Get cached data or fetch fresh data
 * @param key - Cache key
 * @param fetchFn - Function to fetch fresh data
 * @param ttlSeconds - Time to live in seconds (default: 60)
 * @returns Cached or fresh data
 */
export async function getCached<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 60
): Promise<T> {
  if (!CACHE_ENABLED) {
    return fetchFn()
  }

  const redis = getRedis()

  try {
    const cached = await redis.get(key)
    if (cached !== null) {
      console.log(`[Cache HIT] ${key}`)
      return JSON.parse(cached) as T
    }
  } catch (err) {
    console.error(`[Cache] Get error for key '${key}':`, err)
  }

  console.log(`[Cache MISS] ${key}`)
  const data = await fetchFn()

  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds)
  } catch (err) {
    console.error(`[Cache] Set error for key '${key}':`, err)
  }

  return data
}

/**
 * Invalidate cache keys matching a pattern
 * @param pattern - Redis key pattern (e.g., 'dashboard:*')
 * @returns Number of keys deleted
 */
export async function invalidateCache(pattern: string): Promise<number> {
  if (!CACHE_ENABLED) {
    return 0
  }

  const redis = getRedis()

  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
      console.log(`[Cache] Invalidated ${keys.length} keys matching pattern: ${pattern}`)
      return keys.length
    }
  } catch (err) {
    console.error(`[Cache] Invalidation error for pattern '${pattern}':`, err)
  }

  return 0
}

/**
 * Set HTTP cache headers on response (for Express)
 * @param res - Express response object
 * @param maxAge - Max age in seconds (default: 30)
 */
export function setCacheHeaders(res: any, maxAge = 30): void {
  if (res && res.headers) {
    res.headers.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`)
  } else if (res && res.setHeader) {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`)
  }
}

/**
 * Delete a specific cache key
 * @param key - Cache key to delete
 * @returns True if deleted successfully
 */
export async function deleteCache(key: string): Promise<boolean> {
  if (!CACHE_ENABLED) {
    return false
  }

  const redis = getRedis()

  try {
    await redis.del(key)
    console.log(`[Cache] Deleted key: ${key}`)
    return true
  } catch (err) {
    console.error(`[Cache] Delete error for key '${key}':`, err)
    return false
  }
}

/**
 * Get cache status information
 * @returns Cache status info
 */
export async function getCacheStatus(): Promise<{
  enabled: boolean
  status?: string
  keyCount?: number
  info?: string
  error?: string
}> {
  if (!CACHE_ENABLED) {
    return { enabled: false, status: 'disabled' }
  }

  const redis = getRedis()

  try {
    const info = await redis.info('stats')
    const keyCount = await redis.dbsize()
    return {
      enabled: true,
      status: 'connected',
      keyCount,
      info: info.split('\n').slice(0, 5).join(' ')
    }
  } catch (err) {
    return {
      enabled: true,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export default {
  getCached,
  invalidateCache,
  setCacheHeaders,
  deleteCache,
  getCacheStatus
}
