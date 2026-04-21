import { MongoClient, Db } from 'mongodb'

const globalForMongo = globalThis as unknown as {
  mongoClient: MongoClient | undefined
  mongoDb: Db | undefined
}

export async function getMongoDb(): Promise<Db> {
  // Use singleton pattern for MongoDB client to prevent connection pool exhaustion
  if (!globalForMongo.mongoClient) {
    const mongoUri = process.env.DATABASE_URL || 'mongodb://localhost:27017/sms-gateway'
    globalForMongo.mongoClient = new MongoClient(mongoUri, {
      maxPoolSize: 10, // Limit connection pool size
      minPoolSize: 2,  // Maintain minimum connections
      maxIdleTimeMS: 30000 // Close idle connections after 30 seconds
    })

    await globalForMongo.mongoClient.connect()
    globalForMongo.mongoDb = globalForMongo.mongoClient.db()

    console.log('[MongoDB] Native connection established (singleton)')
  }

  return globalForMongo.mongoDb!
}

export async function closeMongoDb() {
  if (globalForMongo.mongoClient) {
    await globalForMongo.mongoClient.close()
    globalForMongo.mongoClient = undefined
    globalForMongo.mongoDb = undefined
  }
}
