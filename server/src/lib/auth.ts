import { betterAuth } from "better-auth"
import { mongodbAdapter } from "@better-auth/mongo-adapter"
import { MongoClient } from "mongodb"
import { generateApiKeyForUser } from "./api-key.js"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set")
}

const client = new MongoClient(process.env.DATABASE_URL)
const db = client.db("sms-gateway")

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:4000",
  database: mongodbAdapter(db), // Don't pass client option to disable transactions
  trustedOrigins: [
    process.env.FRONTEND_URL || "http://localhost:3000"
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "compact"
    }
  },
  advanced: {
    cookiePrefix: "ba",
    crossSubDomainCookies: {
      enabled: false // Different domains, not subdomains
    },
    useSecureCookies: false
  }
})
