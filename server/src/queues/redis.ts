import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    const redisUri = process.env.REDIS_URI || 'redis://localhost:6379'
    redis = new Redis(redisUri, {
      maxRetriesPerRequest: null, // Required for BullMQ
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[Redis] Max retries reached')
          return null
        }
        return Math.min(times * 100, 3000)
      }
    })

    redis.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })

    redis.on('error', (error) => {
      console.error('[Redis] Connection error:', error)
    })
  }
  return redis
}

export async function closeRedis() {
  if (redis) {
    await redis.quit()
    redis = null
  }
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = getRedis()
    await client.ping()
    return true
  } catch (error) {
    console.error('[Redis] Health check failed:', error)
    return false
  }
}
