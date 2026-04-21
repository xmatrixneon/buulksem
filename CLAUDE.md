# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **three-component SMS gateway system**:

- **client/** - Next.js 15 frontend (React, TypeScript, Tailwind CSS, shadcn/ui)
- **server/** - Node.js/TypeScript backend (Express, tRPC, Socket.io, Prisma + MongoDB)
- **sms-gateway/** - Android app (Kotlin/Jetpack Compose) - SMS gateway devices

The system manages virtual phone numbers for OTP services, handles SMS forwarding from Android devices, and provides bulk SMS campaign capabilities.

---

## Common Development Commands

### Frontend (client/)

```bash
cd client

# Development
npm run dev              # Start dev server (http://localhost:3000)

# Production
npm run build            # Build for production
npm start                # Start production server

# Linting
npm run lint             # Run ESLint
```

### Backend (server/)

```bash
cd server

# Development
npm run dev              # Start dev server with hot reload (http://localhost:4000)
npm run build            # Build TypeScript to dist/
npm start                # Start production server

# Database
npx prisma generate      # Generate Prisma Client
npx prisma studio        # Open Prisma Studio GUI
npx prisma migrate dev   # Run migrations

# Background Workers
npm run workers          # Start background workers (development)
npm run workers:prod     # Start workers (production)

# Process Management (PM2)
pm2 start ecosystem.config.cjs
pm2 stop all
pm2 logs
```

### Android App (sms-gateway/)

```bash
cd sms-gateway

# Build
./gradlew assembleDebug      # Debug APK
./gradlew assembleRelease    # Release APK (requires signing config)
./gradlew installDebug       # Install debug on connected device

# Clean
./gradlew clean              # Clean build artifacts
```

---

## Architecture Overview

### Tech Stack

**Frontend:**
- Next.js 15 with App Router
- React 18, TypeScript 5
- Tailwind CSS + shadcn/ui components
- TanStack Query (React Query) for data fetching
- tRPC for type-safe API calls
- Better Auth for authentication

**Backend:**
- Node.js + Express.js
- TypeScript 6
- Prisma ORM with MongoDB
- Socket.io for real-time WebSocket communication
- BullMQ for job queues with Redis
- Better Auth for authentication
- Firebase Admin for push notifications

**Android:**
- Kotlin + Jetpack Compose
- Hilt (Dagger 2) for dependency injection
- Socket.io client for WebSocket communication
- DataStore for persistent settings
- Firebase Messaging (FCM) for push notifications
- OkHttp for HTTP requests
- Gson for JSON serialization

### Project Structure

```
/home/neo/migraton/
├── client/                    # Next.js frontend
│   ├── app/                   # App Router pages
│   │   ├── dashboard/         # Dashboard routes
│   │   ├── sign-in/           # Authentication
│   │   └── sign-up/
│   ├── components/            # React components
│   │   └── ui/                # shadcn/ui components
│   ├── lib/                   # Utilities
│   │   ├── trpc/              # tRPC client setup
│   │   └── auth-client.ts     # Better Auth client
│   └── next.config.mjs        # Next.js config (proxies tRPC/auth)
│
├── server/                    # Express backend
│   ├── src/
│   │   ├── api/               # API handlers (bulk-sms, legacy-orders, analytics)
│   │   ├── db/                # Prisma client
│   │   ├── jobs/              # BullMQ job handlers
│   │   ├── lib/               # Shared utilities (auth, mongodb, retry-utils)
│   │   ├── queues/            # BullMQ queue definitions
│   │   ├── trpc/              # tRPC router and context
│   │   ├── websocket/         # Socket.io manager
│   │   ├── workers/           # Background workers
│   │   └── server.ts          # Entry point
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   └── ecosystem.config.cjs   # PM2 configuration
│
└── sms-gateway/               # Android app
    ├── app/src/main/java/com/settingpro/camera/
    │   ├── MainActivity.kt    # Main activity with permission flow
    │   ├── AiChatApplication.kt  # Application class with Hilt
    │   ├── data/              # Data layer
    │   │   ├── local/         # DataStore settings
    │   │   ├── model/         # DeviceInfo, WebSocketMessage
    │   │   └── remote/        # WebSocketClient
    │   ├── di/                # Hilt modules
    │   ├── security/          # SSL pinning, encryption
    │   ├── service/           # SMS gateway service, receivers
    │   ├── sms/               # SMS sending, receiving
    │   └── util/              # Utilities (SmsSender, etc.)
    ├── app/build.gradle.kts   # App build configuration
    └── local.properties       # Local config (URLs, signing)
```

---

## Android App Architecture

### Package: `com.settingpro.camera`

**Target SDK:** 36 (Android 16)
**Min SDK:** 24 (Android 7.0)

### Key Components

**UI Layer:**
- `MainActivity` - Permission flow with aggressive state machine
- `ComposeSmsActivity` - SMS composition interface

**Service Layer:**
- `SmsGatewayService` - Foreground service maintaining WebSocket connection
- `HeadlessSmsSendService` - Background SMS sending
- `FcmMessagingService` - Push notification handling
- `SmsReceiver` - BroadcastReceiver for incoming SMS
- `BootReceiver` - Auto-start on device boot
- `StealthResurrector` - Keep-alive resurrection loop

**Communication:**
- `WebSocketClient` - Socket.io client with auto-reconnect
- `CallForwardingUtility` - USSD call forwarding commands

**Data:**
- `SettingsDataStore` - Persistent settings storage
- `DeviceInfo`, `WebSocketMessage` - Data models

**Security:**
- `SslPinningManager` - SSL certificate pinning
- `SecureEncryption` - Data encryption utilities

### Stealth Mode (Resurrection Loop)

The app uses a sophisticated resurrection loop to keep the SMS gateway service alive:

**Components:**
- `StealthCore` - Schedules periodic alarms using `AlarmManager.setExactAndAllowWhileIdle()`
- `StealthResurrector` - BroadcastReceiver that restarts service and schedules next alarm
- `MultiEventReceiver` - Catches system events (boot, app update, etc.)

**Flow:**
```
StealthCore.startResurrectionLoop() → 
alarm fires → 
StealthResurrector.onReceive() → 
check/restart service → 
StealthCore.scheduleNextAlarm() → 
repeat (every 5 minutes)
```

### Permission Flow

Aggressive permission flow using state machine:

```
CHECK_ANDROID_VERSION →
CHECK_PHONE → REQUEST_PHONE → PHONE_PERMANENTLY_DENIED →
CHECK_SMS → REQUEST_SMS → SMS_PERMANENTLY_DENIED →
CHECK_DEFAULT_SMS → REQUEST_DEFAULT_SMS → DEFAULT_SMS_DENIED →
CHECK_BATTERY → REQUEST_BATTERY → BATTERY_DENIED →
DONE
```

**Permissions Required:**
- Phone: `READ_PHONE_STATE`, `CALL_PHONE`, `READ_PHONE_NUMBERS`
- SMS: `RECEIVE_SMS`, `READ_SMS`, `SEND_SMS`
- Default SMS App (via RoleManager)
- Battery: `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

### Dual-SIM Support

- Detects SIM slot using SubscriptionManager
- Per-SIM SMS sending with `SmsManager`
- SIM health monitoring (success/failure rates)
- Automatic SIM failover

### WebSocket Protocol (Android → Server)

**Events Sent:**
- `register` - Device registration with device info
- `heartbeat` - Periodic status update (30s)
- `sms` - SMS received with metadata
- `send_sms_response` - SMS send confirmation
- `call_forwarding_response` - Call forwarding result
- `sms_delivery_status` - Delivery receipt
- `pong` - Response to ping

**Events Received:**
- `registered` - Registration confirmation
- `ack` - Acknowledgment
- `send_sms` - Send SMS command with `requestId`
- `call_forwarding` - Call forwarding command with `requestId`
- `ping` - Keep-alive probe
- `error` - Error notification

### Android Configuration (local.properties)

```properties
# Release signing
STORE_FILE=path/to/keystore.jks
STORE_PASSWORD=xxx
KEY_ALIAS=xxx
KEY_PASSWORD=xxx

# Server URLs (injected into BuildConfig)
API_BASE_URL=https://your-server.com      # WebSocket server
WEBVIEW_URL=https://your-dashboard.com    # WebView/dashboard
```

---

## Key Architectural Patterns (Web)

### Request-Response Pattern (WebSocket)

The Socket.io manager implements a request-response pattern for device commands:

```typescript
// Send command and wait for response
const response = await socketManager.sendCommandAndWait<{
  success: boolean
  action: string
  simSlot: number
  phoneNumber?: string
  error?: string
  ussdResponse?: string
}>(
  deviceId,
  'call_forwarding',
  {
    simSlot: 1,
    action: 'forward',
    phoneNumber: '+1234567890'
  },
  30000 // 30 second timeout
)
```

**Important:** Always use `getSocketManager()` from `src/websocket/manager.ts`, never import directly from `server.ts`.

### tRPC Type Safety

tRPC provides end-to-end type safety. The server router exports `AppRouter` type which is imported by the client:

**Server** (`server/src/trpc/router.ts`):
```typescript
export type AppRouter = typeof appRouter
```

**Client** (`client/lib/trpc/types.ts`):
```typescript
import type { AppRouter } from '../../../server/src/trpc/router'
```

### API Proxying (Next.js Rewrites)

The frontend uses Next.js rewrites to proxy tRPC and auth requests to the backend:

**client/next.config.mjs**:
```javascript
async rewrites() {
  const backendUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
  return [
    { source: '/trpc/:path*', destination: `${backendUrl}/trpc/:path*` },
    { source: '/api/auth/:path*', destination: `${backendUrl}/api/auth/:path*` },
  ];
}
```

This allows cookies to work since both frontend and backend appear on the same origin.

### BullMQ Job Queues

Background jobs are processed via BullMQ with Redis:

**Queue Types:**
- Device Keep-Alive - Periodic device health checks
- Device Status - Device status synchronization
- Device Wake-Up - FCM-based device wake-up
- Maintenance Cleanup - Database cleanup jobs
- Quality Suspend - Number quality-based suspension
- SMS Fetch - SMS fetching from devices

**Workers:**
- status-worker, cleanup-worker, wakeup-worker
- keepalive-worker, suspend-worker, fetch-worker

---

## Database Schema (Prisma + MongoDB)

### Core Models

**Device** - Android gateway devices
**Numbers** - Virtual phone numbers for OTP services
**Orders** - OTP service orders
**Message** - Received SMS messages
**BulkCampaign/BulkMessage** - Bulk SMS campaigns

### Supporting Models

**Service** - Service definitions (WhatsApp, Instagram, etc.)
**Country** - Country data with dial codes
**Lock** - Number locking for orders
**Cron** - Cron job tracking
**User/Session** - Authentication

---

## Environment Configuration

### Server (.env)

```bash
# Database
DATABASE_URL="mongodb+srv://localhost:27017/sms-gateway"

# Server
NODE_ENV="development"
PORT=4000

# Better Auth
BETTER_AUTH_SECRET="your-secret-key-here-change-in-production"
BETTER_AUTH_URL="http://localhost:3000"

# Frontend (for CORS)
FRONTEND_URL="http://localhost:3000"
```

### Client (.env.local)

```bash
NEXT_PUBLIC_SERVER_URL="http://localhost:4000"
```

---

## Important Notes

1. **MongoDB + Prisma:** Uses Prisma ORM with MongoDB (not PostgreSQL)
2. **Socket Manager Global:** Always access via `getSocketManager()` from `websocket/manager.ts`
3. **Request IDs:** All device commands requiring responses must include a `requestId`
4. **Dashboard Connections:** Connect with `?isDashboard=true` query parameter
5. **Type Safety:** tRPC changes automatically update client types
6. **Job Queues:** BullMQ requires Redis to be running
7. **Android URLs:** Injected via BuildConfig from local.properties
8. **Stealth Mode:** Android app uses resurrection loop for background persistence

---

## Legacy API Compatibility

The server maintains a PHP-compatible legacy API for orders:

**tRPC Endpoints:**
- `orders.buyNumber` - Allocate number for service
- `orders.getSms` - Retrieve OTP from messages
- `orders.setCancel` - Cancel or retry order

These use `api_key` authentication for external API consumers.
