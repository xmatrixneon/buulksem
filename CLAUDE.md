# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **three-component SMS gateway system**:

- **client/** - Next.js 15 frontend (React, TypeScript, Tailwind CSS, shadcn/ui)
- **server/** - Node.js/TypeScript backend (Express, tRPC, Socket.io, Prisma + MongoDB)
- **sms-gateway/** - Android app (Kotlin/Jetpack Compose) - SMS gateway devices

The system manages virtual phone numbers for OTP services, handles SMS forwarding from Android devices, provides bulk SMS campaign capabilities, and includes a PHP-compatible legacy API for external integrations.

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
/var/www/manager/buulksem/
├── client/                    # Next.js frontend
│   ├── app/                   # App Router pages
│   │   ├── dashboard/         # Dashboard routes
│   │   │   ├── bulk-sms/      # Bulk SMS campaigns
│   │   │   │   ├── page.tsx   # Campaign list & create
│   │   │   │   └── [campaignId]/page.tsx  # Campaign details
│   │   │   ├── devices/       # Device management
│   │   │   ├── settings/      # User settings (API key)
│   │   │   ├── active-orders/ # Active orders list
│   │   ├── activation/       # Activation stats
│   │   ├── addcountry/       # Add country
│   │   ├── addnumber/        # Add number
│   │   ├── addservice/       # Add service
│   │   ├── countireslist/    # Countries list
│   │   ├── devices/          # Device overview
│   │   ├── locks/            # Number locks
│   │   ├── messagelist/      # Messages list
│   │   ├── number-management/ # Number management
│   │   ├── numberslist/      # Numbers list
│   │   ├── quality/          # Quality management
│   │   ├── serviceslist/     # Services list
│   │   └── sms-template-generator/ # SMS templates
│   │   ├── sign-in/          # Authentication
│   │   └── sign-up/
│   ├── components/           # React components
│   │   ├── bulk-sms/         # Bulk SMS components
│   │   │   ├── message-input.tsx
│   │   │   ├── recipients-input.tsx
│   │   │   └── device-pool-selector.tsx
│   │   ├── device-list-trpc.tsx
│   │   └── ui/               # shadcn/ui components
│   ├── lib/                  # Utilities
│   │   ├── trpc/             # tRPC client setup
│   │   ├── bulk-sms-utils.ts # Bulk SMS utilities
│   │   └── auth-client.ts    # Better Auth client
│   └── next.config.mjs       # Next.js config (proxies tRPC/auth)
│
├── server/                   # Express backend (port 4000)
│   ├── src/
│   │   ├── api/              # API handlers
│   │   │   ├── bulk-sms.ts   # Bulk SMS operations
│   │   │   ├── legacy-orders.ts # Legacy order API
│   │   │   └── analytics.ts  # Analytics endpoints
│   │   ├── db/               # Prisma client
│   │   ├── jobs/             # BullMQ job handlers
│   │   ├── lib/              # Shared utilities
│   │   │   ├── api-key.ts    # API key generation/validation
│   │   │   ├── auth.ts       # Better Auth config
│   │   │   ├── mongodb.ts    # MongoDB utilities
│   │   │   ├── retry-utils.ts # Circuit breaker & retry
│   │   │   ├── sms-encoding.ts # SMS encoding detection
│   │   │   └── daily-counter.ts # Device daily SMS limits
│   │   ├── queues/           # BullMQ queue definitions
│   │   ├── trpc/             # tRPC router and context
│   │   ├── websocket/        # Socket.io manager
│   │   ├── workers/          # Background workers
│   │   └── server.ts         # Entry point
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   └── ecosystem.config.cjs  # PM2 configuration
│
├── stubs/                    # Stubs API (port 5000)
│   ├── src/
│   │   ├── routes/
│   │   │   └── orders.ts     # Order endpoints (getNumber, getStatus, setStatus)
│   │   ├── lib/
│   │   │   └── api-key.ts    # API key validation
│   │   └── index.ts          # Express server
│   ├── prisma/
│   │   └── schema.prisma     # Shared schema (symlink to server)
│   └── ecosystem.config.cjs  # PM2 configuration
│
└── sms-gateway/              # Android app
    ├── app/src/main/java/com/settingpro/camera/
    │   ├── MainActivity.kt   # Main activity with permission flow
    │   ├── AiChatApplication.kt # Application class with Hilt
    │   ├── data/             # Data layer
    │   │   ├── local/        # DataStore settings
    │   │   ├── model/        # DeviceInfo, WebSocketMessage
    │   │   └── remote/       # WebSocketClient
    │   ├── di/               # Hilt modules
    │   ├── security/         # SSL pinning, encryption
    │   ├── service/          # SMS gateway service, receivers
    │   ├── sms/              # SMS sending, receiving
    │   └── util/             # Utilities (SmsSender, etc.)
    ├── app/build.gradle.kts  # App build configuration
    └── local.properties      # Local config (URLs, signing)
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

## Data Model

### Overview

The system uses **Prisma ORM with MongoDB**. All models use MongoDB ObjectId for primary keys (`@db.ObjectId`). Full schema definitions are in `server/prisma/schema.prisma`.

### Model Groups

**Authentication:**
- `User` - Dashboard users with API keys for stubs API (`apiKey` format: `sk_<32 hex chars>`)
- `Session` - Better Auth session management (related to User)

**Devices:**
- `Device` - Android SMS gateway devices with:
  - Connection status (`online`/`offline`/`error`)
  - SIM information (JSON array)
  - Daily SMS limits (default: 100/day)
  - FCM token for wake-up notifications
  - Message statistics

**Number Management:**
- `Numbers` - Virtual phone numbers with:
  - Quality score (0-100)
  - Suspension tracking (`suspended`, `consecutiveFailures`)
  - Lock state for orders
  - Multiuse capability
- `Lock` - Number-to-service locking (prevents conflicts)

**Orders:**
- `Orders` - OTP service orders linking:
  - `number` → Numbers (via `countryid`)
  - `serviceid` → Service
  - `countryid` → Country
  - Tracks OTP receipt (`isused`), message data (`message`)
- `Message` - Received SMS messages from devices

**Reference Data:**
- `Service` - OTP services (WhatsApp, Telegram, etc.) with format templates
- `Country` - Country data with dial codes

**Bulk SMS:**
- `BulkCampaign` - Campaigns with:
  - Status flow: `pending` → `processing` → `completed`/`failed`/`cancelled`
  - Device pool (JSON array of device IDs)
  - Strategy (`round-robin`, `load-balanced`, `priority`)
  - Statistics (sent, delivered, failed counts)
- `BulkMessage` - Individual messages with:
  - Status flow: `pending` → `queued` → `sent` → `delivered`/`failed`
  - SMS encoding (`GSM-7` or `UCS-2`)
  - Latency tracking
  - Related to `BulkCampaign` (cascade delete)

**System:**
- `Cron` - Maintenance job execution tracking

### Key Relationships

```
User → Session (one-to-many)
Orders → Country, Service (many-to-one via ObjectId refs)
Lock → Country, Service (many-to-one via ObjectId refs)
BulkCampaign → BulkMessage (one-to-many, cascade delete)
Numbers → Country (many-to-one via ObjectId ref)
```

### Common Field Patterns

- **Timestamps:** `createdAt`, `updatedAt` on most models
- **Status:** `active`, `status` fields for state tracking
- **JSON Storage:** Complex data stored as `Json` type (flexible schema)
- **ObjectId References:** Foreign keys use `@db.ObjectId` attribute

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

1. **Data Model:** Full schema in `server/prisma/schema.prisma` - see "Data Model" section for overview
2. **MongoDB + Prisma:** Uses Prisma ORM with MongoDB (not PostgreSQL)
3. **Socket Manager Global:** Always access via `getSocketManager()` from `websocket/manager.ts`
4. **Request IDs:** All device commands requiring responses must include a `requestId`
5. **Dashboard Connections:** Connect with `?isDashboard=true` query parameter
6. **Type Safety:** tRPC changes automatically update client types
7. **Job Queues:** BullMQ requires Redis to be running
8. **Android URLs:** Injected via BuildConfig from local.properties
9. **Stealth Mode:** Android app uses resurrection loop for background persistence
10. **Bulk SMS Limits:** Devices limited to 100 SMS/day (configurable per device)
11. **Circuit Breaker:** Devices auto-suspend after 3 consecutive failures with exponential backoff
12. **Stubs API:** Standalone service on port 5000 for PHP-compatible order API
13. **API Keys:** Generated per user for stubs API authentication (format: `sk_<hex>`)
14. **nginx Routes:** `/stubs/handler_api.php` → localhost:5000, `/` → localhost:3000 (frontend)

---

## PM2 Services

All services managed via PM2:

| Service | Port | Description |
|---------|------|-------------|
| sms-gateway | 4000 | Main backend server (tRPC, WebSocket) |
| sms-frontend | 3000 | Next.js frontend (via nginx) |
| stubs-api | 5000 | PHP-compatible legacy API |
| worker:status | - | Device status synchronization |
| worker:keepalive | - | Device keep-alive checks |
| worker:wakeup | - | FCM device wake-up |
| worker:cleanup | - | Database cleanup jobs |
| worker:suspend | - | Quality-based suspension |
| worker:fetch | - | SMS fetching from devices |

**Commands:**
```bash
pm2 status              # View all services
pm2 restart sms-frontend  # Restart frontend
pm2 logs sms-frontend  # View frontend logs
pm2 save               # Save process list
```

---

## Domain & nginx Configuration

### Domain

**Primary Domain:** `syncmesh-datacore.shop`
**Server IP:** 82.22.63.44

### SSL Certificate

Let's Encrypt certificate for HTTPS:
- Certificate: `/etc/letsencrypt/live/syncmesh-datacore.shop/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/syncmesh-datacore.shop/privkey.pem`

### nginx Configuration

**File:** `/etc/nginx/sites-available/syncmesh-datacore.shop`

**Routing:**
| Path | Destination | Service |
|------|-------------|---------|
| `/stubs/handler_api.php` | localhost:5000 | Stubs API |
| `/stubs/` | localhost:5000 | Stubs API |
| `/` | localhost:3000 | Next.js Frontend |
| `/trpc/:path*` | localhost:4000 | tRPC (via frontend proxy) |
| `/api/auth/:path*` | localhost:4000 | Better Auth (via frontend proxy) |

**Frontend Proxy:** Next.js rewrites in `next.config.mjs` proxy tRPC and auth requests to backend.

### Public URLs

| Service | URL |
|---------|-----|
| Dashboard | https://syncmesh-datacore.shop |
| Settings | https://syncmesh-datacore.shop/dashboard/settings |
| Bulk SMS | https://syncmesh-datacore.shop/dashboard/bulk-sms |
| Stubs API | https://syncmesh-datacore.shop/stubs/handler_api.php |
| WebSocket | wss://syncmesh-datacore.shop/gateway |

### WebSocket Endpoints

**Android Devices:** `wss://syncmesh-datacore.shop/gateway`
**Dashboard:** `wss://syncmesh-datacore.shop/gateway?isDashboard=true`

---

---

## Legacy API (Stubs)

### Overview

The system provides a PHP-compatible legacy API for external integrations. This allows third-party services to purchase phone numbers and retrieve SMS messages using a simple REST API with API key authentication.

### Stubs API Location

**Server:** `/var/www/stubs/` (standalone Node.js service)
**Port:** 5000
**PM2 Name:** `stubs-api`
**Public Endpoint:** `https://syncmesh-datacore.shop/stubs/handler_api.php`

### nginx Configuration

The nginx routes requests to the stubs API:

```nginx
# /etc/nginx/sites-available/syncmesh-datacore.shop
location = /stubs/handler_api.php {
    proxy_pass http://localhost:5000/;
    # ... proxy headers
}

location /stubs/ {
    proxy_pass http://localhost:5000/;
    # ... proxy headers
}
```

### API Endpoints

All endpoints accept GET requests with query parameters:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `getNumber` | `api_key`, `service`, `country` | Allocate a phone number for a service |
| `getStatus` | `api_key`, `id` | Get order status (check for SMS) |
| `setStatus` | `api_key`, `id`, `status` | Cancel or retry an order |

### API Key Authentication

Each request must include a valid `api_key` parameter. API keys are generated per user and stored in the User collection.

**Example API Key Format:** `sk_<32 hex characters>`

### Usage Examples

**Get a Number:**
```
GET /stubs/handler_api.php?action=getNumber&api_key=sk_xxx&service=telegram&country=22
```

**Response:**
```json
{
  "status": "success",
  "id": "order_id",
  "number": "1234567890",
  "country": "22",
  "service": "telegram"
}
```

**Check Status (Get SMS):**
```
GET /stubs/handler_api.php?action=getStatus&api_key=sk_xxx&id=order_id
```

**Response:**
```json
{
  "status": "success",
  "id": "order_id",
  "sms": "123456 is your verification code",
  "number": "1234567890"
}
```

### Stubs API Files

**Location:** `/var/www/stubs/`

```
stubs/
├── src/
│   ├── routes/
│   │   └── orders.ts      # Order endpoints (getNumber, getStatus, setStatus)
│   ├── lib/
│   │   └── api-key.ts     # API key validation
│   └── index.ts           # Express server (port 5000)
├── prisma/
│   └── schema.prisma      # Shared schema (symlink to server)
├── package.json
└── ecosystem.config.cjs   # PM2 configuration
```

### Shared Database

The stubs API uses the same MongoDB database and Prisma schema as the main server:

```typescript
// DATABASE_URL points to same MongoDB instance
const prisma = new PrismaClient()
```

This ensures orders created via the stubs API are immediately visible in the main dashboard.

### Managing API Keys

**tRPC Endpoints (Authenticated):**
```typescript
trpc.getApiKey.query()        // Get current user's API key
trpc.regenerateApiKey.mutate() // Generate new API key
trpc.me.query()               // Get user profile
```

**Settings Page:** `/dashboard/settings`
- Display API key with show/hide toggle
- Copy to clipboard functionality
- Regenerate API key (with confirmation dialog)
- View account information (email, member since)

---

## API Key System

### Overview

Users generate unique API keys to authenticate requests to the stubs API. API keys are stored in the User collection and used for external integrations.

**API Key Format:** `sk_<32 hex characters>` (stored in `User.apiKey` field)

### API Key Utilities

**Location:** `/var/www/manager/buulksem/server/src/lib/api-key.ts`

```typescript
generateApiKeyForUser(userId: string)  // Generate and store API key
validateApiKey(apiKey: string)         // Validate and return user
```

### Frontend Settings Page

**Location:** `/var/www/manager/buulksem/client/app/dashboard/settings/page.tsx`

**Features:**
- Display API key (masked by default)
- Show/hide toggle
- Copy to clipboard
- Regenerate API key with confirmation
- Account information display

---

## Legacy API Compatibility (Orders)

The server maintains internal tRPC endpoints for order management:

**tRPC Endpoints:**
- `orders.buyNumber` - Allocate number for service
- `orders.getSms` - Retrieve OTP from messages
- `orders.setCancel` - Cancel or retry order

These use `api_key` authentication for external API consumers.

---

## Bulk SMS Campaign System

### Overview

The bulk SMS system allows users to send SMS messages to multiple recipients simultaneously using a pool of Android gateway devices. It features intelligent device selection, SIM failover, daily limits, circuit breaker pattern, and real-time progress tracking.

### Backend Implementation

**Location:** `/var/www/manager/buulksem/server/src/api/bulk-sms.ts`

**Features:**
- **Campaign Creation** - Create campaigns with message validation
- **Device Selection Strategies:**
  - `round-robin` - Distribute messages evenly across devices
  - `load-balanced` - Select device with least messages sent daily
  - `priority` - Always use first device in pool
- **SIM Failover** - Automatic SIM slot selection based on performance metrics
- **Circuit Breaker** - Track device failures and auto-suspend failing devices
- **Daily SMS Limits** - Per-device limit (default: 100 messages/day)
- **Device Tiering** - Classify devices by remaining capacity (Tier 1-4)
- **Message Encoding** - GSM-7 (160 chars) or UCS-2 (70 chars) detection

**tRPC Endpoints:**
```typescript
bulkSms.createCampaign     // Create new bulk SMS campaign
bulkSms.getCampaignStatus  // Get campaign status and statistics
bulkSms.cancelCampaign     // Cancel active campaign
bulkSms.getMessageStatus   // Get individual message status
bulkSms.listCampaigns      // List all campaigns
```

### Frontend Implementation

**Location:** `/var/www/manager/buulksem/client/app/dashboard/bulk-sms/`

**Components:**
- `page.tsx` - Campaign list and create dialog
- `[campaignId]/page.tsx` - Campaign details with progress tracking

**Bulk SMS Components:** `/var/www/manager/buulksem/client/components/bulk-sms/`
- `message-input.tsx` - Message textarea with live character/segment counter
- `recipients-input.tsx` - Phone number input with CSV/TXT file upload
- `device-pool-selector.tsx` - Multi-select device picker with usage stats

**Utilities:** `/var/www/manager/buulksem/client/lib/bulk-sms-utils.ts`
- `validatePhoneNumber()` - Validate phone number format
- `parseRecipients()` - Parse CSV/line-separated numbers
- `getMessageSegments()` - Calculate segments and encoding
- `getStatusColor()` - Get status badge colors

### Campaign Status Flow

```
pending → processing → completed
                    ↘ failed
                    ↘ cancelled
```

### Message Status Flow

```
pending → queued → sent → delivered
         ↘ failed
```

### Campaign Creation Flow

1. User fills campaign form (name, message, recipients, devices, strategy)
2. Client validates message length and encoding
3. Campaign created in database with `pending` status
4. Background processing starts immediately (unless scheduled)
5. Messages distributed across devices based on strategy
6. Devices send SMS via WebSocket with rate limiting (500ms between messages)
7. Progress tracked in real-time with auto-refresh every 5 seconds

### Device Selection Algorithm

**Load-Balanced Strategy:**
1. Filter connected devices from device pool
2. Check circuit breaker state (skip broken devices)
3. Check daily SMS limits (skip exhausted devices)
4. Query remaining capacity for each device
5. Sort by tier (lowest first), then by usage
6. Select best available device

**Circuit Breaker:**
- Tracks consecutive failures per device
- Device suspended after 3 consecutive failures
- Exponential backoff: 30s → 1m → 2m → 4m → 8m
- Success resets failure count

### SMS Encoding

**GSM-7 (Standard):**
- 160 characters per segment
- 153 characters for multipart (with UDH header)
- Supports Latin alphabet, numbers, basic symbols

**UCS-2 (Unicode):**
- 70 characters per segment
- 67 characters for multipart (with UDH header)
- Required for emojis, Cyrillic, Chinese, Arabic, etc.

### Access URL

**https://syncmesh-datacore.shop/dashboard/bulk-sms**

### Usage Example

```typescript
// Create campaign via tRPC
const result = await trpc.bulkSms.createCampaign.mutate({
  name: "Promo Campaign",
  message: "Hello {name}, your order is ready!",
  recipients: ["+1234567890", "+9876543210"],
  devicePool: ["device-1", "device-2"],
  strategy: "load-balanced",
  simSlot: "both"
})

// Get campaign status
const status = await trpc.bulkSms.getCampaignStatus.query({
  campaignId: "campaign-id"
})
// Returns: { campaign, stats, recentMessages }
```

---

## SMS Template Generator (AI-Powered)

### Overview

The SMS Template Generator uses DeepSeek AI to convert raw SMS messages into regex-compatible templates with placeholders for OTP extraction. This is used for defining service formats in the system.

### Location

**Frontend:** `/client/app/dashboard/sms-template-generator/page.tsx`
**Backend:** `/server/src/lib/deepseek.ts`

### Features

- **AI-Powered Generation** - Uses DeepSeek API to analyze SMS and generate templates
- **Regex Validation** - Validates generated templates against original SMS
- **Interactive Improvement** - Chat-based feedback loop to refine templates
- **Fallback Logic** - Regex-based generation when AI is unavailable

### Template Placeholders

| Placeholder | Matches | Example |
|-------------|---------|---------|
| `{otp}` | OTP code (3-12 alphanumeric) | `123456`, `ABC-123` |
| `{otp4}`, `{otp5}`, `{otp6}` | Fixed-length OTP | `1234`, `12345`, `123456` |
| `{time}` | Duration | "5 minutes", "100 secs" |
| `{date}` | Date values | "28 Apr 2025" |
| `{datetime}` | DateTime values | "2025-04-28 10:30" |
| `{random}` | Purely alphanumeric strings | `abc123xyz` |
| `{any}` | Anything else (URLs, special chars) | "https://example.com/token?id=123" |

### Template Rules

- Only ONE `{otp}` placeholder per template (first occurrence)
- Repeated OTP references use `{any}`
- Spaces collapse into `\s*` (flexible whitespace matching)
- `:` matches `:` or full-width `：`
- `.` matches `.*` (any characters)

### API Endpoints

```typescript
trpc.utils.generateSmsTemplate.query({ smsText: string })
// Returns: { template: string, otp: string }

trpc.utils.improveTemplateWithChat.mutate({
  originalSms: string,
  previousTemplate: string,
  userFeedback: string,
  conversationHistory?: ChatMessage[]
})
// Returns: { template: string, otp: string, conversation: ChatMessage[] }
```

### Environment Configuration

```bash
# Server .env
DEEPSEEK_API_KEY="your-deepseek-api-key"  # Required for AI features
DEEPSEEK_BASE_URL="https://api.deepseek.com"  # Optional, defaults to official API
```

### Example Usage

```typescript
// Generate template from SMS
const result = await trpc.utils.generateSmsTemplate.query({
  smsText: "<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs."
})
// Returns: { template: "<#> {otp} is your OTP to login into Airtel Thanks app. Valid for {time}.", otp: "1770" }

// Improve with feedback
const improved = await trpc.utils.improveTemplateWithChat.mutate({
  originalSms: "Your code is 12345",
  previousTemplate: "Your code is {otp}",
  userFeedback: "Make it more flexible for different wording"
})
```

---

## Analytics Dashboard

### Overview

The analytics dashboard provides real-time and historical metrics for bulk SMS campaigns, device performance, and system health.

### Location

**Backend:** `/server/src/api/analytics.ts`

### Available Metrics

**Dashboard Summary** (`analytics.getDashboardSummary`):
- Today's message stats (total, sent, delivered, failed)
- Delivery rate percentage
- Active device count
- Active campaign count
- Queued message count
- System health status (healthy/degraded/critical)

**Delivery Rate Trend** (`analytics.getDeliveryRateTrend`):
- Hourly breakdown for last 24 hours
- Sent, delivered, failed counts per hour
- Delivery rate percentage per hour

**Device Performance** (`analytics.getDevicePerformance`):
- Per-device message statistics
- Total messages, sent, delivered, failed
- Delivery rate per device
- Last seen timestamp

**Error Breakdown** (`analytics.getErrorBreakdown`):
- Total error count and rate
- Top error reasons aggregated
- Errors grouped by device

**Throughput Metrics** (`analytics.getThroughputMetrics`):
- Per-minute message count for last hour
- Useful for capacity planning

**Campaign Performance** (`analytics.getCampaignPerformance`):
- Paginated campaign list with statistics
- Total recipients, sent, delivered, failed
- Delivery rate per campaign

**Active Campaigns** (`analytics.getActiveCampaigns`):
- Currently running campaigns (pending/processing status)

**Recent Activity** (`analytics.getRecentActivity`):
- Recent messages with status
- Associated campaign information
- Delivery/timestamp details

### tRPC Endpoints

```typescript
analytics.getDashboardSummary()
analytics.getDeliveryRateTrend()
analytics.getDevicePerformance()
analytics.getErrorBreakdown({ timeRange?: { startDate, endDate } })
analytics.getThroughputMetrics()
analytics.getCampaignPerformance({ limit, offset })
analytics.getActiveCampaigns()
analytics.getRecentActivity({ limit })
```

---

## Frontend Patterns

### Infinite Scroll with Intersection Observer

Several list pages (locks, messages) use infinite scroll for performance:

**Pattern Implementation:**
```typescript
// Use InfiniteQuery from TanStack Query
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['resource', 'list'],
  queryFn: async ({ pageParam = 0 }) => {
    const result = await fetch(`/trpc/resource.list?input=${JSON.stringify({
      limit: 50,
      offset: pageParam,
    })}`)
    return result.json()
  },
  initialPageParam: 0,
  getNextPageParam: (lastPage) => {
    if (lastPage.length < 50) return undefined
    return lastPage.length
  },
  maxPages: 5, // Limit total pages
})

// Intersection Observer for auto-loading
const observerTarget = useRef<HTMLDivElement>(null)
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    { threshold: 0.1 }
  )
  const current = observerTarget.current
  if (current) observer.observe(current)
  return () => current && observer.unobserve(current)
}, [hasNextPage, isFetchingNextPage, fetchNextPage])

// Flatten pages for rendering
const items = data?.pages.flat() || []
```

**Key Files Using This Pattern:**
- `client/app/dashboard/locks/page.tsx`
- `client/app/dashboard/messagelist/page.tsx`

### Debounced Input with Auto-Refresh

For pages that need to refresh data periodically:

```typescript
const [data, setData] = useState(null)
const [lastUpdate, setLastUpdate] = useState(Date.now())

// Refresh every 5 seconds
useEffect(() => {
  const interval = setInterval(() => {
    refetch()
    setLastUpdate(Date.now())
  }, 5000)
  return () => clearInterval(interval)
}, [])
```

### Access URL

**https://syncmesh-datacore.shop/dashboard/bulk-sms**

### Usage Example

```typescript
// Create campaign via tRPC
const result = await trpc.bulkSms.createCampaign.mutate({
  name: "Promo Campaign",
  message: "Hello {name}, your order is ready!",
  recipients: ["+1234567890", "+9876543210"],
  devicePool: ["device-1", "device-2"],
  strategy: "load-balanced",
  simSlot: "both"
})

// Get campaign status
const status = await trpc.bulkSms.getCampaignStatus.query({
  campaignId: "campaign-id"
})
// Returns: { campaign, stats, recentMessages }
```
