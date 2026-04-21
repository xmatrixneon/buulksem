import "dotenv/config"
import express from "express"
import { createServer } from "http"
import { createExpressMiddleware } from "@trpc/server/adapters/express"
import { toNodeHandler } from "better-auth/node"
import cors from "cors"
import { auth } from "./lib/auth"
import { appRouter } from "./trpc/router"
import { createContext } from "./trpc/context"
import { initSocketIO } from "./websocket/manager"

const app = express()

// CORS configuration for cross-domain requests
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}

app.use(cors(corsOptions))

// Better Auth endpoints
app.use("/api/auth", toNodeHandler(auth))

// tRPC middleware (handles its own body parsing with superjson)
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    allowMethodOverride: true
  })
)

// Health check endpoint (non-tRPC for compatibility)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000

// Create HTTP server for Socket.io
const httpServer = createServer(app)

// Initialize Socket.io
const socketManager = initSocketIO(httpServer)

// Make socket manager globally available
;(global as any).socketManager = socketManager

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Socket.io gateway available at /gateway`)
})
