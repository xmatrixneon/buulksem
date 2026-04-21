/**
 * Redis Daily SMS Counter Utilities
 *
 * Tracks daily SMS count per device using Redis with automatic expiry
 *
 * Key Format: device:daily:counter:{deviceId}
 * TTL: 24 hours (auto-expires at midnight)
 */

import { Redis } from 'ioredis';

// Redis client singleton
let redisClient: Redis | null = null;

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 500);
        return delay;
      }
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err);
    });
  }
  return redisClient;
}

/**
 * Check if device can send SMS (under daily limit)
 */
export async function canDeviceSendSMS(deviceId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `device:daily:counter:${deviceId}`;

  try {
    const count = await redis.get(key);
    const limit = 100; // Default limit

    if (!count) {
      // No counter yet, device can send
      return true;
    }

    const currentCount = parseInt(count, 10);
    return currentCount < limit;
  } catch (error) {
    console.error(`[Redis] Error checking device ${deviceId}:`, error);
    return true; // On error, allow sending (fail open)
  }
}

/**
 * Increment SMS counter for device
 * Returns new count after increment
 */
export async function incrementDeviceSMSCount(deviceId: string): Promise<number> {
  const redis = getRedisClient();
  const key = `device:daily:counter:${deviceId}`;
  const ttl = 86400; // 24 hours in seconds

  try {
    // Increment counter
    const newCount = await redis.incr(key);

    // Set TTL to 24 hours from now (resets daily)
    // Only set TTL if not already set (preserves expiry time)
    const currentTTL = await redis.ttl(key);
    if (currentTTL === -1 || currentTTL === -2) {
      await redis.expire(key, ttl);
    }

    return newCount;
  } catch (error) {
    console.error(`[Redis] Error incrementing device ${deviceId}:`, error);
    return 0;
  }
}

/**
 * Get current SMS count for device today
 */
export async function getDeviceSMSCount(deviceId: string): Promise<number> {
  const redis = getRedisClient();
  const key = `device:daily:counter:${deviceId}`;

  try {
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    console.error(`[Redis] Error getting count for device ${deviceId}:`, error);
    return 0;
  }
}

/**
 * Check if daily counter needs reset (next day)
 */
export async function needsDailyReset(deviceId: string, lastResetAt?: Date): Promise<boolean> {
  const redis = getRedisClient();
  const key = `device:daily:counter:${deviceId}`;

  try {
    const ttl = await redis.ttl(key);

    // TTL of -1 means no expiry (persistent)
    // TTL of -2 means key doesn't exist
    // TTL > 0 means seconds until expiry

    if (ttl === -2) {
      // Key doesn't exist, no reset needed
      return false;
    }

    if (ttl === -1) {
      // Key has no expiry, needs reset
      return true;
    }

    // Calculate when it was set (approximately)
    const timeUntilExpiry = ttl; // seconds until midnight
    const timeSinceSet = 86400 - timeUntilExpiry;

    // If it's been more than 24 hours since last reset
    return timeSinceSet >= 86400;

  } catch (error) {
    console.error(`[Redis] Error checking reset for device ${deviceId}:`, error);
    return false;
  }
}

/**
 * Reset daily SMS counter for device
 */
export async function resetDeviceDailyCounter(deviceId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `device:daily:counter:${deviceId}`;

  try {
    // Delete the counter - device starts fresh
    await redis.del(key);
    console.log(`[Redis] Reset daily counter for device ${deviceId}`);
  } catch (error) {
    console.error(`[Redis] Error resetting device ${deviceId}:`, error);
  }
}

/**
 * Force reset all daily counters (emergency use)
 */
export async function resetAllDailyCounters(): Promise<number> {
  const redis = getRedisClient();

  try {
    const pattern = 'device:daily:counter:*';
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Reset ${keys.length} daily counters`);
    }

    return keys.length;
  } catch (error) {
    console.error('[Redis] Error resetting all counters:', error);
    return 0;
  }
}

/**
 * Get device tier based on daily usage
 * Tier 1: 0-50 SMS (Fresh)
 * Tier 2: 51-80 SMS (Mid-day)
 * Tier 3: 81-99 SMS (Near limit)
 * Tier 4: 100 SMS (At limit)
 */
export async function getDeviceTier(deviceId: string): Promise<{
  tier: 1 | 2 | 3 | 4
  usage: number
  remaining: number
  status: 'active' | 'warning' | 'critical' | 'retired'
}> {
  const count = await getDeviceSMSCount(deviceId);

  if (count < 50) {
    return {
      tier: 1,
      usage: count,
      remaining: 100 - count,
      status: 'active'
    };
  } else if (count < 80) {
    return {
      tier: 2,
      usage: count,
      remaining: 100 - count,
      status: 'active'
    };
  } else if (count < 100) {
    return {
      tier: 3,
      usage: count,
      remaining: 100 - count,
      status: 'warning'
    };
  } else {
    return {
      tier: 4,
      usage: count,
      remaining: 0,
      status: 'retired'
    };
  }
}

/**
 * Get statistics for all devices
 */
export async function getDailyStats(): Promise<{
  totalDevices: number
  activeDevices: number
  retiredDevices: number
  totalMessagesToday: number
  avgMessagesPerDevice: number
}> {
  const redis = getRedisClient();

  try {
    const pattern = 'device:daily:counter:*';
    const keys = await redis.keys(pattern);

    let totalCount = 0;
    let activeCount = 0;
    let retiredCount = 0;

    for (const key of keys) {
      const count = await redis.get(key);
      if (count) {
        const countNum = parseInt(count, 10);
        totalCount += countNum;

        if (countNum < 100) {
          activeCount++;
        } else {
          retiredCount++;
        }
      }
    }

    return {
      totalDevices: keys.length,
      activeDevices: activeCount,
      retiredDevices: retiredCount,
      totalMessagesToday: totalCount,
      avgMessagesPerDevice: keys.length > 0 ? Math.floor(totalCount / keys.length) : 0
    };
  } catch (error) {
    console.error('[Redis] Error getting stats:', error);
    return {
      totalDevices: 0,
      activeDevices: 0,
      retiredDevices: 0,
      totalMessagesToday: 0,
      avgMessagesPerDevice: 0
    };
  }
}