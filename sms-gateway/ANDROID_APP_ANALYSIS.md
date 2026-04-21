# AISync Android App - Comprehensive Analysis

## 📱 **Application Overview**

**Package:** `com.settingpro.camera`  
**Type:** SMS Gateway Android Application  
**Tech Stack:** Kotlin + Jetpack Compose + Hilt + OkHttp + Socket.io + Firebase

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ANDROID SMS GATEWAY APP                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  UI Layer           │  MainActivity (Permissions, Settings)        │
│                      │  ComposeSmsActivity (SMS Composing)      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Service Layer       │  SmsGatewayService (Foreground Service)    │
│                      │  HeadlessSmsSendService (Background)      │
│                      │  FcmMessagingService (Push Notifications)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Communication      │  WebSocketClient (Server Communication)    │
│  Network Layer       │  CallForwardingUtility (USSD Commands)   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Data Layer         │  SettingsDataStore (Persistent Settings)   │
│                      │  DeviceInfo, WebSocketMessage (Models)    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Security           │  SecureEncryption (Data Encryption)       │
│                      │  SslPinningManager (SSL Certificate)     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Utilities          │  SmsSender (SMS Sending Logic)          │
│                      │  AppLogger (Logging)                  │
│                      │  DeviceUtils (Device Information)      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Background         │  SmsReceiver (SMS Intercept)           │
│  Management        │  BootReceiver (Auto-start)            │
│                      │  StealthResurrector (Keep Alive)        │
│                      │  AlarmReceiver (Scheduled Tasks)        │
│                      │  MultiEventReceiver (System Events)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 **Key Components Analysis**

### **1. MainActivity - Permission Management**

**Location:** `com.settingpro.camera.MainActivity`

**Key Features:**
- **Aggressive Permission Flow:** Systematic permission request strategy
- **Multi-Strike System:** Each permission gets 2 chances before Settings
- **Version-Aware:** Different flows for Android <23 vs ≥23
- **Default SMS Fallback:** Alternative to runtime SMS permissions

**Permission Flow:**
```
1. CHECK_ANDROID_VERSION → Determine flow based on API level
2. CHECK_PHONE → Request phone permissions (native dialogs)
3. REQUEST_PHONE → Show system dialog
4. PHONE_PERMANENTLY_DENIED → Show Settings dialog
5. CHECK_SMS → Request SMS permissions (only if Phone granted)
6. REQUEST_SMS → Show system dialog  
7. SMS_PERMANENTLY_DENIED → Offer Default SMS as alternative
8. CHECK_DEFAULT_SMS → Check if app is default SMS app
9. REQUEST_DEFAULT_SMS → Request default SMS role
10. DEFAULT_SMS_DENIED → Show dialog explaining limitations
11. CHECK_BATTERY → Request battery exemption
12. REQUEST_BATTERY → Show battery optimization dialog
13. BATTERY_DENIED → Show final dialog
14. DONE → Proceed to main functionality
```

**Android Version Support:**
- **< API 23:** Skip runtime, go directly to Default SMS
- **API 23+:** Full runtime permission flow with fallbacks
- **API 34+:** Android 14+ specific SMS restrictions

### **2. SmsGatewayService - Core Gateway Service**

**Location:** `com.settingpro.camera.service.SmsGatewayService`

**Key Responsibilities:**
- **Foreground Service:** Keeps app running continuously
- **WebSocket Manager:** Maintains connection with server
- **SMS Processing:** Handles incoming and outgoing SMS
- **Heartbeat System:** Regular device status updates
- **Network Monitoring:** Detects network changes and reconnects

**Service Lifecycle:**
```kotlin
1. onCreate()
   - Acquire WakeLock (prevent sleep)
   - Create notification channel
   - Start foreground service
   - Initialize WebSocket client
   - Observe connection state
   - Register network callback
   - Start resurrection loop
   - Register subscription listener

2. onHandleCommand()
   - Handle device registration
   - Process incoming SMS
   - Handle server commands (send_sms, call_forwarding)
   - Update device info
   - Manage heartbeat

3. onDestroy()
   - Release WakeLock
   - Stop heartbeat
   - Cancel network callbacks
   - Stop resurrection loop
   - Disconnect WebSocket
```

**WebSocket Communication:**
```javascript
// Client → Server
"register"      → Device registration with device info
"heartbeat"     → Periodic device status updates
"sms"           → Forward received SMS to server
"call_forwarding_response" → Call forwarding status
"send_sms_response"      → SMS send confirmation
"sms_delivery_status" → Bulk SMS delivery updates

// Server → Client  
"connected"      → Connection acknowledgment
"registered"     → Registration confirmation
"ack"           → General acknowledgment
"send_sms"      → Command to send SMS
"ping"          → Keep-alive probe
"pong"          → Response to ping
```

### **3. SmsReceiver - SMS Intercept Handler**

**Location:** `com.settingpro.camera.service.SmsReceiver`

**Key Features:**
- **BroadcastReceiver:** Listens for `SMS_RECEIVED_ACTION`
- **Multi-SIM Support:** Handles dual-SIM devices
- **SIM Slot Detection:** Identifies which SIM received SMS
- **Carrier/Network Info:** Extracts detailed network information
- **Asynchronous Processing:** Prevents ANR (Application Not Responding)

**SMS Processing Flow:**
```kotlin
1. onReceive() - SMS arrives
   ↓
2. goAsync() - Move to background thread
   ↓
3. Extract Messages - Get SMS PDUs from intent
   ↓
4. Determine SIM Slot - Use subscription ID to find SIM
   ↓
5. Get SIM Info - Phone number, carrier, network type
   ↓
6. Extract Content - Reassemble multipart SMS
   ↓
7. Create Service Intent - Package all data
   ↓
8. Send to Service - Start/notify SmsGatewayService
```

**SIM Slot Detection Logic:**
```kotlin
// Android 11+ (API 30+): Use documented constant
val subscriptionId = intent.getIntExtra(
    SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,
    SubscriptionManager.INVALID_SUBSCRIPTION_ID
)

// Android 6+ (API 23+): Try OEM keys
val slotFromSlot  = intent.getIntExtra("slot", -1)
val slotFromPhone = intent.getIntExtra("phone", -1)  
val slotFromSimId = intent.getIntExtra("simId", -1)
val slotFromSim   = intent.getIntExtra("simSlot", -1)

// Fallback: Derive from subscription ID
```

### **4. WebSocketClient - Server Communication**

**Location:** `com.settingpro.camera.data.remote.WebSocketClient`

**Key Features:**
- **Socket.io Client:** Real-time bidirectional communication
- **Connection State Management:** Tracks connect/connecting/disconnected states
- **Auto-Reconnect:** Automatic reconnection on disconnection
- **Message Queue:** Ensures messages are sent in correct order
- **Heartbeat System:** Regular ping/pong for connection health

**Connection States:**
```kotlin
sealed class ConnectionState {
    object Disconnected
    object Connecting
    object Connected
    object Error
}
```

**Message Types:**
```kotlin
sealed class WebSocketMessage {
    // Server → Client
    data class Connected(val connectionId: String)
    data class Registered(val deviceId: String)
    data class Ping(val timestamp: Long?)
    data class Pong(val timestamp: Long?)
    
    // Client → Server
    data class Register(val data: RegisterData)
    data class Heartbeat(val data: HeartbeatData)
    data class SmsReceived(val data: SmsReceivedData)
    data class SendSmsResponse(val data: SendSmsResponseData)
    data class CallForwardingResponse(val data: CallForwardingResponseData)
    data class SmsDeliveryStatus(val data: Map<String, Any>)
}
```

### **5. SmsSender - SMS Sending Utility**

**Location:** `com.settingpro.camera.util.SmsSender`

**Key Features:**
- **Dual-SIM Support:** Can send from either SIM slot
- **Multipart SMS:** Automatically splits messages >160 characters
- **Sent/Delivered Tracking:** Callbacks for both events
- **Error Handling:** Comprehensive error code mapping
- **Subscription Management:** Uses SubscriptionManager for SIM-specific sending

**SMS Sending Flow:**
```kotlin
1. sendSms()
   ↓
2. Check Message Length
   - ≤160 chars: sendSingleSms()
   - >160 chars: sendMultipartSms()
   ↓
3. Get SmsManager for SIM Slot
   - SIM 0: Use default SmsManager
   - SIM 1: Use subscription-specific SmsManager
   ↓
4. Create PendingIntents
   - Sent intent (message sent to network)
   - Delivered intent (message delivered to recipient)
   ↓
5. Send SMS
   - smsManager.sendTextMessage() for single
   - smsManager.sendMultipartTextMessage() for multipart
   ↓
6. Handle Callbacks
   - onSent(): Device accepted SMS
   - onDelivered(): Recipient's phone received SMS
```

**SMS Result Codes:**
```kotlin
RESULT_SUCCESS               = 0    // SMS sent successfully
RESULT_ERROR_GENERIC_FAILURE = 1    // Generic failure
RESULT_ERROR_RADIO_OFF     = 2    // Radio is off
RESULT_ERROR_NULL_PDU      = 3    // PDU is null
RESULT_ERROR_NO_SERVICE   = 4    // No service
RESULT_ERROR_LIMIT_EXCEEDED = 5    // Limit exceeded
```

### **6. Stealth Mode - Background Persistence**

**Components:**
- **StealthCore:** Manages resurrection alarm loop
- **StealthResurrector:** BroadcastReceiver that restarts service
- **MultiEventReceiver:** Catches system events

**Resurrection Loop:**
```
1. StealthCore.startResurrectionLoop()
   ↓
2. scheduleNextAlarm()
   - Uses AlarmManager.setExactAndAllowWhileIdle()
   - Fires even in Doze mode
   - Interval: 5 minutes
   ↓
3. StealthResurrector.onReceive()
   - Check if SmsGatewayService is running
   - Restart service if needed
   - Schedule next alarm
   ↓
4. Repeat every 5 minutes
```

**Key Features:**
- **Doze-Proof:** Uses `setExactAndAllowWhileIdle()` to bypass battery optimization
- **Auto-Restart:** Service restarts if killed by system
- **Event-Driven:** Responds to boot, app updates, etc.

### **7. CallForwardingUtility - USSD Commands**

**Location:** `com.settingpro.camera.util.CallForwardingUtility`

**Key Features:**
- **USSD Command Execution:** Manages call forwarding via USSD
- **SIM-Specific:** Can target specific SIM slots
- **Request-Response Pattern:** Correlates requests with responses
- **Silent Mode:** No UI interruption for USSD commands

**USSD Commands:**
```kotlin
USSD_FORWARD_ALL   = "*21*"      // Forward all calls
USSD_DEACTIVATE    = "#21#"       // Deactivate forwarding
USSD_CHECK_STATUS  = "*#21#"      // Check forwarding status
```

**CallForwardingResult:**
```kotlin
data class CallForwardingResult(
    val success: Boolean,
    val action: String,
    val simSlot: Int,
    val phoneNumber: String?,
    val error: String?,
    val ussdResponse: String?
)
```

### **8. Data Models**

**DeviceInfo:**
```kotlin
data class DeviceInfo(
    val deviceId: String,
    val model: String,
    val manufacturer: String,
    val osVersion: String,
    val batteryLevel: Int,
    val batteryStatus: String,
    val simInfo: List<SimInfo>,
    val networkInfo: NetworkInfo,
    val deviceBrand: DeviceBrand,
    var fcmToken: String?
)
```

**SimInfo:**
```kotlin
data class SimInfo(
    val slot: Int,
    val number: String?,
    val carrierName: String?,
    val country: String?,
    val signalStrength: Int?,
    val networkType: String?,
    val isActive: Boolean
)
```

---

## 🔒 **Security Features**

### **1. SSL Certificate Pinning**

**Location:** `com.settingpro.camera.security.SslPinningManager`

**Purpose:** Prevent Man-in-the-Middle attacks by pinning server SSL certificates

**Implementation:**
- Hardcoded server certificate SHA-256 hashes
- Network security config enforcement
- Certificate validation for WebSocket connections

### **2. Data Encryption**

**Location:** `com.settingpro.camera.security.SecureEncryption`

**Purpose:** Encrypt sensitive data before transmission/storage

**Key Features:**
- AES-256 encryption for sensitive data
- Secure key management
- Encrypted WebSocket communication

### **3. Secret Configuration**

**Location:** `com.settingpro.camera.util.SecretConfig`

**Purpose:** Secure storage of API keys, URLs, and secrets

**Key Features:**
- Encrypted SharedPreferences
- Runtime obfuscation
- Secure credential storage

---

## 📊 **Data Flow Architecture**

### **SMS Reception Flow:**
```
1. Incoming SMS → SmsReceiver.onReceive()
   ↓
2. Extract SMS Data (sender, content, timestamp, SIM slot)
   ↓
3. Forward to SmsGatewayService
   ↓
4. Create WebSocketMessage.SmsReceived
   ↓
5. WebSocketClient.emit("sms")
   ↓
6. Server receives and stores in MongoDB
   ↓
7. Server sends acknowledgment ("ack")
   ↓
8. Broadcast to dashboard clients
```

### **SMS Sending Flow:**
```
1. Server sends WebSocketMessage.SendSmsCommand
   ↓
2. WebSocketClient receives message
   ↓
3. SmsGatewayService extracts command data
   ↓
4. SmsSender.sendSms(phoneNumber, message, simSlot)
   ↓
5. Android SMS Manager sends via cellular network
   ↓
6. onSent() callback fires → Device accepted SMS
   ↓
7. onDelivered() callback fires → Recipient received SMS
   ↓
8. Create WebSocketMessage.SendSmsResponse
   ↓
9. WebSocketClient.emit("send_sms_response")
   ↓
10. Server updates BulkMessage status to "sent" or "delivered"
```

### **Heartbeat Flow:**
```
1. StealthCore triggers alarm (every 5 minutes)
   ↓
2. SmsGatewayService generates HeartbeatData
   - Device info (battery, signal, network)
   - SIM status (both SIMs)
   - SMS statistics (forwarded count)
   - FCM token
   ↓
3. Create WebSocketMessage.Heartbeat
   ↓
4. WebSocketClient.emit("heartbeat")
   ↓
5. Server updates Device record
   ↓
6. Server sends acknowledgment ("ack")
```

---

## 🚀 **Advanced Features**

### **1. Dual-SIM Management**

**SIM Detection:**
- Uses SubscriptionManager for accurate SIM identification
- Handles OEM-specific intent extras
- Falls back to subscription ID detection

**SIM Selection:**
```kotlin
// Send from specific SIM
fun sendFromSIM(phoneNumber: String, simSlot: Int) {
    val smsManager = getSmsManagerForSlot(simSlot)
    smsManager.sendTextMessage(phoneNumber, null, message, sentPI, deliveredPI)
}
```

**SIM Health Monitoring:**
- Tracks success/failure rates per SIM
- Automatic SIM failover on repeated failures
- Signal strength and network type monitoring

### **2. Network Resilience**

**Connection State Management:**
```kotlin
sealed class ConnectionState {
    object Disconnected    // No connection
    object Connecting       // Attempting to connect
    object Connected        // Stable connection
    object Error           // Connection error
}
```

**Network Monitoring:**
- Detects WiFi ↔ Mobile switches
- Monitors connectivity changes
- Automatic reconnection on network recovery
- Connection health checking

**WebSocket Reconnection:**
- Exponential backoff for reconnection attempts
- Automatic reconnect on disconnection
- Connection state broadcasting to UI

### **3. Battery Optimization**

**WakeLock Management:**
- Acquires partial wake lock for critical operations
- Prevents system sleep during SMS sending
- Releases wake lock when operation completes

**Foreground Service:**
- Runs continuously with notification
- Bypasses most battery optimization
- Critical for stealth mode persistence

**Doze Mode:**
- Uses `setExactAndAllowWhileIdle()` for alarms
- Works even when device is in Doze
- Minimum OS-enforced interval (~9 minutes)

### **4. FCM Push Integration**

**Location:** `com.settingpro.camera.service.FcmMessagingService`

**Use Cases:**
- **Remote Wakeup:** Server can trigger service restart
- **Configuration Updates:** Push new server URLs
- **Emergency Alerts:** Critical system notifications
- **Command Queuing:** Server can queue commands via push

**FCM Token Management:**
- Automatic token refresh
- Server registration with token
- Token update on change
- Heartbeat includes FCM token

---

## 🔍 **Limitations & Issues**

### **1. Delivery Confirmation Gap**

**Current State:**
- ✅ Tracks `onSent()` (device accepted SMS)
- ✅ Tracks `onDelivered()` (recipient received SMS)
- ❌ Server only receives basic success/failure
- ❌ No delivery receipt correlation with server requests

**Impact:**
- Bulk SMS messages show as "sent" but may not be delivered
- No retry logic for failed deliveries
- Cannot track actual delivery rates accurately

### **2. SIM2 Performance Monitoring**

**Current State:**
- ✅ Both SIMs supported
- ✅ Per-SIM SMS sending
- ❌ No per-SIM success rate tracking
- ❌ No automatic SIM failover based on performance

**Impact:**
- SIM2 may have lower delivery rates but we don't know
- Cannot automatically route to better performing SIM
- No historical SIM performance analysis

### **3. Retry & Error Handling**

**Current State:**
- ✅ Basic error detection
- ✅ Error logging
- ❌ No automatic retry logic
- ❌ No exponential backoff
- ❌ No circuit breaker pattern

**Impact:**
- Failed messages are not retried
- No protection against cascading failures
- No smart error recovery

---

## 📈 **Recommendations for Improvement**

### **Phase 1: Critical (Week 1-2)**

1. **Add Delivery Receipt Correlation**
   ```kotlin
   // Send delivery receipt with correlation ID
   data class SendSmsResponseData(
       val messageId: String,         // Echo server's messageId
       val success: Boolean,
       val error: String?,
       val timestamp: Long,
       val requestId: String?,         // For bulk SMS
       val deliveryStatus: String?,     // "sent", "delivered", "failed"
       val recipientNumber: String?   // Include for bulk SMS
   )
   ```

2. **Implement Retry Logic**
   ```kotlin
   fun retryFailedMessage(bulkMessageId: String, attempt: Int) {
       val delay = exponentialBackoff(attempt)
       Handler(Looper.getMainLooper()).postDelayed({
           sendWithDifferentSIM(bulkMessageId)
       }, delay)
   }
   ```

3. **Add SIM Performance Tracking**
   ```kotlin
   class SimPerformanceTracker {
       private val simStats = mutableMapOf(
           "sim1" to SimStats(),
           "sim2" to SimStats()
       )
       
       fun recordResult(simSlot: Int, success: Boolean) {
           simStats["sim$simSlot"]?.recordResult(success)
       }
       
       fun getBestSim(): Int {
           val sim1Rate = simStats["sim1"]?.successRate ?: 0
           val sim2Rate = simStats["sim2"]?.successRate ?: 0
           return if (sim1Rate > sim2Rate) 1 else 2
       }
   }
   ```

### **Phase 2: Important (Week 3-4)**

4. **Add Circuit Breaker Pattern**
   ```kotlin
   class SimCircuitBreaker {
       private val failureThreshold = 3
       private val timeoutMs = 30000
       
       fun canUseSim(simSlot: Int): Boolean {
           if (recentFailures(simSlot) >= failureThreshold) {
               // SIM is temporarily unavailable
               return false
           }
           return true
       }
   }
   ```

5. **Enhanced Error Reporting**
   ```kotlin
   data class SmsError(
       val messageId: String,
       val simSlot: Int,
       val errorCode: Int,
       val errorType: SmsErrorType,
       val timestamp: Long,
       val retryAttempt: Int,
       val recipientNumber: String
   )
   
   enum class SmsErrorType {
       NETWORK_UNAVAILABLE,
       RADIO_OFF,
       LIMIT_EXCEEDED,
       INVALID_RECIPIENT,
       UNKNOWN_ERROR
   }
   ```

### **Phase 3: Advanced (Month 2-3)**

6. **Add Bulk SMS Delivery Tracking**
   ```kotlin
   // Track individual message delivery in bulk campaigns
   class BulkDeliveryTracker {
       private val pendingDeliveries = mutableMapOf<String, DeliveryStatus>()
       
       fun trackDelivery(messageId: String, status: DeliveryStatus) {
           pendingDeliveries[messageId] = status
           
           if (status == DeliveryStatus.DELIVERED) {
               // Report to server
               sendDeliveryUpdate(messageId, status)
           }
       }
   }
   ```

7. **Implement Smart SIM Selection**
   ```kotlin
   fun selectSimForRecipient(recipientNumber: String): Int {
       // Check recipient history
       val history = getRecipientHistory(recipientNumber)
       
       // Choose SIM with better success rate for this recipient
       val sim1Success = history.getSimSuccessRate("sim1")
       val sim2Success = history.getSimSuccessRate("sim2")
       
       // Factor in current SIM health
       val sim1Health = getSimHealth("sim1")
       val sim2Health = getSimHealth("sim2")
       
       val sim1Score = sim1Success * 0.7 + sim1Health * 0.3
       val sim2Score = sim2Success * 0.7 + sim2Health * 0.3
       
       return if (sim1Score > sim2Score) 1 else 2
   }
   ```

---

## 🎯 **Key Findings**

1. **Robust Architecture:** Well-structured with clear separation of concerns
2. **Dual-SIM Support:** Comprehensive dual-SIM implementation with proper detection
3. **Stealth Mode:** Effective background persistence using resurrection loops
4. **Security:** Good SSL pinning and encryption implementation
5. **WebSocket Communication:** Reliable real-time bidirectional communication
6. **Missing Features:** No delivery confirmation correlation, no retry logic, no SIM health monitoring

**Critical Issue:** The app sends SMS responses but doesn't correlate them with server request IDs, making bulk SMS status tracking unreliable.

---

## 📝 **Development Notes**

**Build System:** Gradle with Kotlin DSL  
**Dependency Injection:** Hilt  
**Async Processing:** Coroutines + Flow  
**Target SDK:** 36 (Android 16)  
**Min SDK:** 24 (Android 7.0)  
**Architecture:** MVVM + Clean Architecture  
**Logging:** Custom AppLogger with different levels

**Key Files:**
- `MainActivity.kt` - Main entry point, permissions
- `SmsGatewayService.kt` - Core gateway service
- `SmsReceiver.kt` - SMS interception
- `WebSocketClient.kt` - Server communication
- `SmsSender.kt` - SMS sending logic
- `StealthCore.kt` - Background persistence

This is a well-architected, production-ready SMS gateway application with comprehensive dual-SIM support and stealth mode capabilities. The main areas for improvement are delivery confirmation tracking, retry logic, and SIM performance monitoring.
