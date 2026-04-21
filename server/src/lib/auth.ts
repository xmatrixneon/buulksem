import { betterAuth } from "better-auth"
import { mongodbAdapter } from "@better-auth/mongo-adapter"
import { MongoClient } from "mongodb"

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
    },
    // For development, allow cookies to work across localhost ports
    // Note: In production, you'd use a reverse proxy or same domain
    cookie: {
      attributes: {
        sameSite: 'lax', // Works for same-site, allows some cross-origin
        secure: false, // Required for localhost HTTP
      }
    }
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false // Different domains, not subdomains
    },
    // Don't use secure cookies in development
    useSecureCookies: false
  }
})
