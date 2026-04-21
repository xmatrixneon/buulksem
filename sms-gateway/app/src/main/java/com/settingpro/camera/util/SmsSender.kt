package com.settingpro.camera.util

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import java.util.UUID
import kotlin.math.ceil

/**
 * Utility class for sending SMS messages with dual-SIM support.
 *
 * Features:
 * - Encoding-aware message splitting (GSM-7 vs UCS-2)
 * - Dual-SIM support via subscription ID
 * - Sent and delivered intent callbacks
 * - Error handling and reporting
 *
 * SMS Encoding Standards:
 * - GSM-7 (7-bit): 160 chars (single), 153 chars (multipart with UDH header)
 * - UCS-2/UTF-16 (16-bit): 70 chars (single), 67 chars (multipart with UDH header)
 * - Extended GSM-7 chars: ^ { } \ [ ] ~ | € (count as 2 chars each)
 */
class SmsSender(private val context: Context) {

    companion object {
        private const val TAG = "SmsSender"
        const val SMS_SENT_ACTION = "com.settingpro.camera.SMS_SENT"
        const val SMS_DELIVERED_ACTION = "com.settingpro.camera.SMS_DELIVERED"

        // Intent extras
        const val EXTRA_MESSAGE_ID = "message_id"
        const val EXTRA_PART_INDEX = "part_index"
        const val EXTRA_TOTAL_PARTS = "total_parts"
        const val EXTRA_SIM_SLOT = "sim_slot"

        // SMS result codes from SmsManager
        const val RESULT_SUCCESS = SmsManager.STATUS_ON_ICC_SENT
        const val RESULT_ERROR_GENERIC_FAILURE = SmsManager.RESULT_ERROR_GENERIC_FAILURE
        const val RESULT_ERROR_RADIO_OFF = SmsManager.RESULT_ERROR_RADIO_OFF
        const val RESULT_ERROR_NULL_PDU = SmsManager.RESULT_ERROR_NULL_PDU
        const val RESULT_ERROR_NO_SERVICE = SmsManager.RESULT_ERROR_NO_SERVICE
        const val RESULT_ERROR_LIMIT_EXCEEDED = SmsManager.RESULT_ERROR_LIMIT_EXCEEDED

        // GSM-7 character sets
        private const val GSM_7_BASIC = "@£\$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
        private const val GSM_7_EXTENDED = "^{}\\[~]|€"

        /**
         * Get error message from SMS result code
         */
        fun getErrorFromResultCode(resultCode: Int): String {
            return when (resultCode) {
                RESULT_SUCCESS -> "Success"
                RESULT_ERROR_GENERIC_FAILURE -> "Generic failure"
                RESULT_ERROR_RADIO_OFF -> "Radio is off"
                RESULT_ERROR_NULL_PDU -> "PDU is null"
                RESULT_ERROR_NO_SERVICE -> "No service"
                RESULT_ERROR_LIMIT_EXCEEDED -> "Limit exceeded"
                else -> "Unknown error (code: $resultCode)"
            }
        }

        /**
         * Check if a character is GSM-7 compatible
         *
         * @param char Single character to check
         * @return true if character is GSM-7 compatible, false if requires UCS-2
         */
        private fun isGsm7Char(char: Char): Boolean {
            if (GSM_7_BASIC.contains(char)) return true
            if (GSM_7_EXTENDED.contains(char)) return true
            if (char.code == 0x1B) return true // ESC character
            return false
        }

        /**
         * Check if message requires UCS-2 encoding
         *
         * A message requires UCS-2 encoding if it contains any non-GSM-7 characters
         * (e.g., emojis, Cyrillic, Chinese, Japanese, Arabic, etc.)
         *
         * @param message Message text to check
         * @return true if message requires UCS-2 encoding
         */
        fun requiresUcs2Encoding(message: String): Boolean {
            for (char in message) {
                if (!isGsm7Char(char)) {
                    return true
                }
            }
            return false
        }

        /**
         * Get message segment count
         *
         * Calculates how many SMS segments a message will require based on its encoding
         * and length. Single messages have 160 (GSM-7) or 70 (UCS-2) chars.
         * Multipart messages have 153 (GSM-7) or 67 (UCS-2) chars per segment.
         *
         * @param message Message text to analyze
         * @return Number of SMS segments required
         */
        fun getSegmentCount(message: String): Int {
            val isUcs2 = requiresUcs2Encoding(message)
            val length = message.length

            return if (isUcs2) {
                // UCS-2: 70 chars single, 67 chars per segment
                if (length <= 70) 1 else ceil(length / 67.0).toInt()
            } else {
                // GSM-7: 160 chars single, 153 chars per segment
                if (length <= 160) 1 else ceil(length / 153.0).toInt()
            }
        }

        /**
         * Get message encoding info for display
         *
         * @param message Message text to analyze
         * @return MessageInfo object containing encoding details
         */
        fun getMessageInfo(message: String): MessageInfo {
            val isUcs2 = requiresUcs2Encoding(message)
            val segments = getSegmentCount(message)

            return MessageInfo(
                length = message.length,
                encoding = if (isUcs2) "UCS-2" else "GSM-7",
                segments = segments,
                description = if (isUcs2) {
                    "Unicode (emojis, special chars)"
                } else {
                    "Standard text"
                }
            )
        }
    }

    /**
     * Message information for UI display
     */
    data class MessageInfo(
        val length: Int,
        val encoding: String,
        val segments: Int,
        val description: String
    )

    private val defaultSmsManager: SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    private val subscriptionManager: SubscriptionManager? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            context.getSystemService(SubscriptionManager::class.java)
        } else {
            null
        }

    /**
     * Result of an SMS send operation
     */
    data class SendResult(
        val messageId: String,
        val success: Boolean,
        val partsSent: Int,
        val totalParts: Int,
        val error: String? = null,
        val errorCode: Int? = null
    )

    /**
     * Callbacks for SMS sending status
     */
    interface SendCallback {
        fun onSent(messageId: String, partIndex: Int, totalParts: Int, success: Boolean, error: String?)
        fun onDelivered(messageId: String, partIndex: Int, totalParts: Int, success: Boolean, error: String?)
    }

    /**
     * Send an SMS message
     *
     * @param phoneNumber The recipient phone number
     * @param message The message content
     * @param simSlot The SIM slot to use (0 or 1)
     * @param callback Callbacks for sent/delivered status
     * @return The message ID for tracking
     */
    fun sendSms(
        phoneNumber: String,
        message: String,
        simSlot: Int = 0,
        callback: SendCallback
    ): String {
        val messageId = UUID.randomUUID().toString()

        try {
            // Get message info for logging and validation
            val messageInfo = getMessageInfo(message)
            AppLogger.d(TAG, "Sending SMS: ${messageInfo.length} chars, ${messageInfo.encoding} encoding, ${messageInfo.segments} segment(s)")

            // Check segment limit (typically 10 segments max by carriers)
            if (messageInfo.segments > 10) {
                val error = "Message too long: ${messageInfo.segments} segments (max 10)"
                AppLogger.e(TAG, error)
                callback.onSent(messageId, 0, 0, false, error)
                return messageId
            }

            // Get the appropriate SmsManager for the specified SIM slot
            val smsManager = getSmsManagerForSlot(simSlot)

            if (smsManager == null) {
                AppLogger.e(TAG, "Failed to get SmsManager for SIM slot: $simSlot")
                callback.onSent(messageId, 0, 0, false, "SIM slot $simSlot not available")
                return messageId
            }

            // Use Android's built-in message division
            // Android automatically handles encoding detection and splitting
            val parts = smsManager.divideMessage(message)

            if (parts.size > 1) {
                // Send as multipart SMS
                sendMultipartSms(smsManager, phoneNumber, message, messageId, simSlot, callback, parts)
            } else {
                // Send as single SMS
                sendSingleSms(smsManager, phoneNumber, message, messageId, simSlot, callback)
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to send SMS", e)
            callback.onSent(messageId, 0, 0, false, e.message)
        }

        return messageId
    }

    /**
     * Send a single SMS message
     */
    private fun sendSingleSms(
        smsManager: SmsManager,
        phoneNumber: String,
        message: String,
        messageId: String,
        simSlot: Int,
        callback: SendCallback
    ) {
        val sentIntent = createSentPendingIntent(messageId, 0, 1, simSlot)
        val deliveredIntent = createDeliveredPendingIntent(messageId, 0, 1, simSlot)

        try {
            smsManager.sendTextMessage(
                phoneNumber,
                null, // serviceCenter (null = use default)
                message,
                sentIntent,
                deliveredIntent
            )
            AppLogger.d(TAG, "Single SMS queued for sending: $phoneNumber")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to queue single SMS", e)
            callback.onSent(messageId, 0, 1, false, e.message)
        }
    }

    /**
     * Send a multipart SMS message (for messages > 160 characters)
     *
     * @param smsManager The SmsManager instance
     * @param phoneNumber The recipient phone number
     * @param message The full message content
     * @param messageId The message ID for tracking
     * @param simSlot The SIM slot used
     * @param callback Callbacks for sent/delivered status
     * @param parts Pre-divided message parts (from SmsManager.divideMessage)
     */
    private fun sendMultipartSms(
        smsManager: SmsManager,
        phoneNumber: String,
        message: String,
        messageId: String,
        simSlot: Int,
        callback: SendCallback,
        parts: MutableList<String>
    ) {
        // Use the parts passed in instead of calling divideMessage again
        val totalParts = parts.size

        if (totalParts == 0) {
            AppLogger.e(TAG, "Failed to divide message into parts")
            callback.onSent(messageId, 0, 0, false, "Failed to divide message")
            return
        }

        AppLogger.d(TAG, "Sending multipart SMS: $totalParts parts (${message.length} chars total)")

        // Create pending intents for each part
        val sentIntents = mutableListOf<PendingIntent>()
        val deliveredIntents = mutableListOf<PendingIntent?>()

        for (i in 0 until totalParts) {
            sentIntents.add(createSentPendingIntent(messageId, i, totalParts, simSlot))
            deliveredIntents.add(createDeliveredPendingIntent(messageId, i, totalParts, simSlot))
        }

        try {
            smsManager.sendMultipartTextMessage(
                phoneNumber,
                null, // serviceCenter
                parts,
                ArrayList(sentIntents),
                ArrayList(deliveredIntents)
            )
            AppLogger.d(TAG, "Multipart SMS queued for sending: $phoneNumber ($totalParts parts)")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to queue multipart SMS", e)
            callback.onSent(messageId, 0, totalParts, false, e.message)
        }
    }

    /**
     * Create a PendingIntent for sent status
     */
    private fun createSentPendingIntent(
        messageId: String,
        partIndex: Int,
        totalParts: Int,
        simSlot: Int
    ): PendingIntent {
        val intent = Intent(SMS_SENT_ACTION).apply {
            putExtra(EXTRA_MESSAGE_ID, messageId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            putExtra(EXTRA_SIM_SLOT, simSlot)
            `package` = context.packageName
        }

        return PendingIntent.getBroadcast(
            context,
            generateRequestCode(messageId, partIndex, "sent"),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * Create a PendingIntent for delivered status
     */
    private fun createDeliveredPendingIntent(
        messageId: String,
        partIndex: Int,
        totalParts: Int,
        simSlot: Int
    ): PendingIntent? {
        val intent = Intent(SMS_DELIVERED_ACTION).apply {
            putExtra(EXTRA_MESSAGE_ID, messageId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            putExtra(EXTRA_SIM_SLOT, simSlot)
            `package` = context.packageName
        }

        return PendingIntent.getBroadcast(
            context,
            generateRequestCode(messageId, partIndex, "delivered"),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /**
     * Generate a unique request code for PendingIntent
     */
    private fun generateRequestCode(messageId: String, partIndex: Int, type: String): Int {
        val combined = "$messageId-$partIndex-$type".hashCode()
        return combined and 0xFFFFFF // Ensure positive int
    }

    /**
     * Get SmsManager for a specific SIM slot
     *
     * @param simSlot The SIM slot (0 or 1)
     * @return SmsManager for the specified slot, or default manager if slot not available
     */
    private fun getSmsManagerForSlot(simSlot: Int): SmsManager? {
        if (simSlot == 0) {
            // Slot 0 uses default SmsManager
            return defaultSmsManager
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
            // Dual-SIM not supported before Android 5.1
            AppLogger.w(TAG, "Dual-SIM requires Android 5.1+")
            return defaultSmsManager
        }

        try {
            // Get active subscriptions
            val subscriptions = subscriptionManager?.activeSubscriptionInfoList
            if (subscriptions.isNullOrEmpty()) {
                AppLogger.w(TAG, "No active SIM subscriptions found")
                return defaultSmsManager
            }

            // Find the subscription for the requested slot
            // Convert 1-based slot (from API) to 0-based simSlotIndex (Android)
            val targetSlotIndex = simSlot - 1
            val targetSubscription = subscriptions.find { it.simSlotIndex == targetSlotIndex }

            if (targetSubscription == null) {
                AppLogger.w(TAG, "No subscription found for SIM slot $simSlot (index $targetSlotIndex), using default")
                return defaultSmsManager
            }

            // Try to create SmsManager for specific subscription using reflection
            // This avoids API compatibility issues
            val subscriptionId = targetSubscription.subscriptionId
            try {
                val method = SmsManager::class.java.getMethod(
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        "createForSubscriptionId"
                    } else {
                        "createForSubscriptionId"
                    },
                    Int::class.javaPrimitiveType
                )

                @Suppress("DEPRECATION")
                val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Instance method for Android 12+
                    method.invoke(defaultSmsManager, subscriptionId) as? SmsManager
                } else {
                    // Static method for Android 5.1-11
                    method.invoke(null, subscriptionId) as? SmsManager
                }

                if (result != null) {
                    return result
                }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Reflection failed for createForSubscriptionId: ${e.message}")
            }

            // Fallback to default manager
            AppLogger.w(TAG, "Using default SMS manager for slot $simSlot")
            return defaultSmsManager
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error getting SmsManager for SIM slot $simSlot", e)
            return defaultSmsManager
        }
    }

    /**
     * Check if a specific SIM slot is available
     */
    fun isSimSlotAvailable(simSlot: Int): Boolean {
        if (simSlot == 0) return true // Default SIM always available

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
            return false
        }

        return try {
            val subscriptions = subscriptionManager?.activeSubscriptionInfoList
            // Convert 1-based slot (from API) to 0-based simSlotIndex (Android)
            val targetSlotIndex = simSlot - 1
            subscriptions?.any { it.simSlotIndex == targetSlotIndex } ?: false
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error checking SIM slot availability", e)
            false
        }
    }
}
