import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { prisma } from '../db/prisma'
import { randomUUID } from 'crypto'
import {
  recordCircuitFailure,
  recordCircuitSuccess,
  updateSimPerformance,
  classifyError
} from '../lib/retry-utils'

interface SocketData {
  deviceId?: string
  isDashboard?: boolean
  connectionId: string
}

// Type-safe request-response interfaces
interface PendingRequest<T = any> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  createdAt: Date
  deviceId: string
  command: string
}

interface CallForwardingResponse {
  success: boolean
  action: string
  simSlot: number
  phoneNumber?: string
  error?: string
  ussdResponse?: string
}

interface SendSmsResponse {
  success: boolean
  messageId?: string
  error?: string
}

export class SocketIOManager {
  private io: SocketIOServer
  private deviceConnections: Map<string, string> = new Map() // deviceId -> socketId
  private dashboardClients: Set<string> = new Set()
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private readonly REQUEST_TIMEOUT = 30000 // 30 seconds

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      path: '/gateway',
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling']
    })

    this.setupHandlers()

    // Start periodic cleanup of stale pending requests (every 60 seconds)
    setInterval(() => {
      this.cleanupOldPendingRequests()
    }, 60000)

    console.log('[SocketIO] Manager initialized on /gateway')
  }

  private setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[SocketIO] New connection: ${socket.id}`)

      const { isDashboard, deviceId } = socket.handshake.query
      console.log(`[SocketIO] Connection query:`, { isDashboard, deviceId })
      console.log(`[SocketIO] Total connections: ${this.io.sockets.sockets.size}`)

      if (isDashboard === 'true') {
        this.handleDashboardConnection(socket)
      } else {
        // Device connection - accept without deviceId in query
        // deviceId will be provided in the 'register' event message (legacy flow)
        this.handleDeviceConnection(socket, deviceId as string)
      }

      socket.on('disconnect', () => {
        console.log(`[SocketIO] Disconnect: ${socket.id}, remaining: ${this.io.sockets.sockets.size}`)
        this.handleDisconnect(socket)
      })
    })
  }

  private handleDeviceConnection(socket: any, deviceId?: string) {
    const connectionId = socket.id
    console.log(`[SocketIO] Device connection: ${connectionId}, deviceId: ${deviceId || 'not provided'}`)

    // Device registration handler
    socket.on('register', async (data: any) => {
      let regDeviceId: string | null = null

      try {
        console.log(`[SocketIO] Register event received:`, JSON.stringify(data))
        console.log(`[SocketIO] Data type:`, typeof data)

        // Parse JSON data if it's a string (Socket.io client sends JSON strings)
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        console.log(`[SocketIO] Parsed data:`, JSON.stringify(parsedData))

        regDeviceId = parsedData.deviceId
        const { name, sims, batteryLevel, isCharging, signalStrength, networkType, appVersion, osVersion, deviceModel, manufacturer, fcmToken } = parsedData

        console.log(`[SocketIO] Extracted values - deviceId: ${regDeviceId}, name: ${name}`)

        if (!regDeviceId) {
          socket.emit('error', {
            type: 'error',
            data: { code: 'INVALID_DEVICE_ID', message: 'Device ID is required' }
          })
          return
        }

        // Close existing connection for this device if any (prevent multiple connections)
        const existingSocketId = this.deviceConnections.get(regDeviceId)
        if (existingSocketId && existingSocketId !== socket.id) {
          console.log(`[SocketIO] Replacing existing connection for device: ${regDeviceId}, old socket: ${existingSocketId}, new socket: ${socket.id}`)
          // Find and close the old socket
          const oldSocket = this.io.sockets.sockets.get(existingSocketId)
          if (oldSocket) {
            console.log(`[SocketIO] Old socket found, disconnecting...`)
            oldSocket.emit('disconnected', { reason: 'New connection established' })
            // Force disconnect - close the underlying connection
            oldSocket.disconnect(true)
            // Also force close the socket connection
            oldSocket.conn.close()
            console.log(`[SocketIO] Closed old connection for device ${regDeviceId}`)
          } else {
            console.log(`[SocketIO] Old socket not found in sockets Map (already disconnected?)`)
          }
        }

        // Track device connection (replace old connection)
        this.deviceConnections.set(regDeviceId, socket.id)

        // Mark socket as registered to prevent it from counting as "pending"
        socket.data = socket.data || {}
        socket.data.registeredDeviceId = regDeviceId

        // Use Prisma for consistent database access
        const device = await prisma.device.upsert({
          where: { deviceId: regDeviceId },
          create: {
            deviceId: regDeviceId,
            name: name || 'Unknown Device',
            status: 'online',
            lastHeartbeat: new Date(),
            lastSeen: new Date(),
            sims: sims || [],
            batteryLevel,
            isCharging: isCharging || false,
            signalStrength: signalStrength || 0,
            networkType: networkType || 'unknown',
            appVersion,
            osVersion,
            deviceModel,
            manufacturer,
            fcmToken,
            fcmTokenUpdatedAt: fcmToken ? new Date() : null,
            isActive: true,
            registeredAt: new Date(),
          },
          update: {
            name: name || 'Unknown Device',
            status: 'online',
            lastHeartbeat: new Date(),
            lastSeen: new Date(),
            sims: sims || [],
            batteryLevel,
            isCharging: isCharging || false,
            signalStrength: signalStrength || 0,
            networkType: networkType || 'unknown',
            appVersion,
            osVersion,
            deviceModel,
            manufacturer,
            fcmToken,
            fcmTokenUpdatedAt: fcmToken ? new Date() : null,
            isActive: true,
            updatedAt: new Date()
          }
        })

        console.log(`[SocketIO] Active device connections: ${this.deviceConnections.size}`)
        console.log(`[SocketIO] Device registered successfully: ${regDeviceId}`)

        // Send acknowledgment
        socket.emit('registered', { success: true, deviceId: regDeviceId })

        // Broadcast to dashboard
        this.broadcastToDashboard('device_online', {
          deviceId: regDeviceId,
          name,
          status: 'online',
          timestamp: new Date()
        })

      } catch (error) {
        console.error('[SocketIO] Device registration error:', error)
        console.error('[SocketIO] Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          data: data
        })
        socket.emit('error', { message: 'Registration failed', error: error instanceof Error ? error.message : 'Unknown error' })
      }
    })

    // Heartbeat handler
    socket.on('heartbeat', async (data: any) => {
      try {
        await this.ensureDbConnection()

        // Parse JSON data if it's a string
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        const {
          deviceId: hbDeviceId,
          batteryLevel,
          isCharging,
          signalStrength,
          networkType,
          sims,
          uptime,
          smsForwarded,
          fcmToken
        } = parsedData

        // Log heartbeat received
        console.log(`[SocketIO] Heartbeat received from ${hbDeviceId}, battery: ${batteryLevel}%, signal: ${signalStrength}`)

        if (!hbDeviceId || !this.deviceConnections.has(hbDeviceId)) {
          socket.emit('error', {
            type: 'error',
            data: { code: 'NOT_REGISTERED', message: 'Device not registered' }
          })
          return
        }

        // Get existing device
        const existingDevice = await prisma.device.findUnique({
          where: { deviceId: hbDeviceId }
        })

        // Build update object
        const updateData: any = {
          deviceId: hbDeviceId,
          name: existingDevice?.name || `Device ${hbDeviceId.slice(-6)}`,
          status: 'online',
          isActive: true,
          lastSeen: new Date(),
          lastHeartbeat: new Date(),
          batteryLevel: this.sanitizeBatteryLevel(batteryLevel),
          isCharging,
          signalStrength,
          networkType,
          sims: this.formatSims(sims),
        }

        // Add FCM token if provided
        if (fcmToken) {
          updateData.fcmToken = fcmToken
          updateData.fcmTokenUpdatedAt = new Date()
        }

        // Use upsert to handle device update
        const device = await prisma.device.upsert({
          where: { deviceId: hbDeviceId },
          create: updateData,
          update: updateData
        })

        // Send acknowledgment
        socket.emit('ack', {
          type: 'ack',
          data: { timestamp: Date.now() }
        })

        // Broadcast to dashboard
        this.broadcastToDashboard('device_heartbeat', {
          deviceId: hbDeviceId,
          batteryLevel: this.sanitizeBatteryLevel(batteryLevel),
          isCharging,
          signalStrength,
          networkType,
          sims: this.formatSims(sims),
          uptime,
          smsForwarded,
          lastSeen: new Date()
        })

      } catch (error) {
        console.error('[SocketIO] Heartbeat error:', error)
      }
    })

    // SMS received handler
    socket.on('sms', async (data: any) => {
      try {
        await this.ensureDbConnection()

        // Parse JSON data if it's a string
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        const {
          deviceId,
          sender,
          content,
          timestamp,
          simSlot,
          receiverNumber,
          simCarrier,
          simNetworkType,
          networkType
        } = parsedData

        if (!deviceId || !sender || !content) {
          socket.emit('error', {
            type: 'error',
            data: { code: 'INVALID_SMS_DATA', message: 'Missing required SMS data' }
          })
          return
        }

        // Use Prisma for consistent database access - matching legacy schema
        const message = await prisma.message.create({
          data: {
            sender,
            receiver: receiverNumber || 'Unknown',
            port: receiverNumber || 'Unknown',
            time: new Date(timestamp || Date.now()),
            message: content,
            metadata: {
              deviceId,
              simSlot,
              simCarrier,
              simNetworkType,
              networkType
            }
          }
        })

        // Update device message count
        await prisma.device.update({
          where: { deviceId },
          data: {
            totalMessagesReceived: { increment: 1 },
            lastMessageReceived: new Date()
          }
        })

        console.log(`[SocketIO] SMS saved: ${sender} -> ${receiverNumber} (Device: ${deviceId})`)

        // Send acknowledgment - matching legacy format
        socket.emit('ack', {
          type: 'ack',
          data: { messageId: message.id, success: true }
        })

        // Broadcast to dashboard - matching legacy format
        this.broadcastToDashboard('sms_received', {
          messageId: message.id,
          deviceId,
          sender,
          receiver: receiverNumber || 'Unknown',
          content,
          timestamp: message.time,
          simSlot,
          simCarrier
        })

      } catch (error) {
        console.error('[SocketIO] SMS processing error:', error)
        socket.emit('error', {
          type: 'error',
          data: { code: 'SMS_PROCESSING_FAILED', message: error instanceof Error ? error.message : 'Unknown error' }
        })
      }
    })

    // Call forwarding response handler
    socket.on('call_forwarding_response', async (data: any) => {
      try {
        // Parse JSON data if it's a string
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        const { deviceId, requestId, simSlot, action, success, phoneNumber, error: errorMsg, ussdResponse } = parsedData

        console.log(`[SocketIO] Call forwarding response: ${deviceId} SIM${simSlot} - ${action} - ${success ? 'success' : 'failed'}`)

        // Resolve pending request if requestId exists
        if (requestId) {
          this.resolveRequest<CallForwardingResponse>(requestId, {
            success,
            action,
            simSlot,
            phoneNumber,
            error: errorMsg,
            ussdResponse
          })
        }

        // Broadcast to dashboard
        this.broadcastToDashboard('call_forwarding_update', {
          deviceId,
          simSlot,
          action,
          success,
          phoneNumber,
          error: errorMsg,
          ussdResponse,
          timestamp: new Date()
        })

      } catch (error) {
        console.error('[SocketIO] Call forwarding response error:', error)
      }
    })

    // Send SMS response handler
    socket.on('send_sms_response', async (data: any) => {
      try {
        // Parse JSON data if it's a string
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        const { deviceId, requestId, messageId, success, error: errorMsg } = parsedData

        // Get deviceId from response data or from socket connection data
        const effectiveDeviceId = deviceId || socket.data?.registeredDeviceId || socket.data?.deviceId

        console.log(`[SocketIO] Send SMS response: ${effectiveDeviceId} - ${messageId} - ${success ? 'success' : 'failed'}`)
        console.log(`[SocketIO] Response data:`, JSON.stringify(parsedData))

        // Resolve pending request if requestId exists
        if (requestId) {
          this.resolveRequest<SendSmsResponse>(requestId, {
            success,
            messageId,
            error: errorMsg
          })
        }

        // Update BulkMessage status if this is a bulk SMS message
        // Message ID format for bulk SMS: bulk_{campaignId}_{bulkMessageId}
        // OR match by device message ID if device generates its own IDs
        if (messageId) {
          try {
            let bulkMessageId: string | null = null
            let campaignId: string | null = null

            // Try to parse bulk message ID from our format
            if (messageId.startsWith('bulk_')) {
              const parts = messageId.split('_')
              if (parts.length >= 3) {
                campaignId = parts[1]
                bulkMessageId = parts[2]
              }
            } else {
              // Device generated its own message ID, try to find matching message
              // Look for messages sent to this device that are still in 'queued' status
              const queuedMessages = await prisma.bulkMessage.findMany({
                where: {
                  deviceId: effectiveDeviceId,
                  status: 'queued'
                },
                orderBy: { sentAt: 'desc' },
                take: 5 // Check most recent queued messages
              })

              // Find the most recent queued message that was sent within the last 60 seconds
              const recentThreshold = new Date(Date.now() - 60000)
              const matchingMessage = queuedMessages.find(msg => {
                // msg.sentAt is Date | null from Prisma
                if (!msg.sentAt) return false
                const sentTime = new Date(msg.sentAt)
                return sentTime > recentThreshold
              })

              if (matchingMessage) {
                bulkMessageId = matchingMessage.id
                campaignId = matchingMessage.campaignId
              }
            }

            if (bulkMessageId && campaignId) {
              // Update bulk message status
              const updateData: any = {
                status: success ? 'sent' : 'failed',
                deviceId: effectiveDeviceId,
                sentAt: new Date()
              }

              if (!success) {
                updateData.failedAt = new Date()
                updateData.failureReason = errorMsg || 'Unknown error'
              }

              const updated = await prisma.bulkMessage.update({
                where: { id: bulkMessageId },
                data: updateData
              })

              console.log(`[SocketIO] Updated bulk message ${bulkMessageId}: ${success ? 'sent' : 'failed'}`)

              // Update campaign counters
              const campaignUpdateData: any = {}
              if (success) {
                campaignUpdateData.sentCount = { increment: 1 }
              } else {
                campaignUpdateData.failedCount = { increment: 1 }
              }

              await prisma.bulkCampaign.update({
                where: { id: campaignId },
                data: campaignUpdateData
              })

              console.log(`[SocketIO] Updated campaign ${campaignId} counters`)
            } else {
              console.log(`[SocketIO] Could not find matching bulk message for deviceId: ${effectiveDeviceId}`)
            }

          } catch (error) {
            console.error('[SocketIO] Error updating bulk message:', error)
          }
        }

        // Broadcast to dashboard
        this.broadcastToDashboard('send_sms_update', {
          deviceId: effectiveDeviceId,
          messageId,
          success,
          error: errorMsg,
          timestamp: new Date()
        })

      } catch (error) {
        console.error('[SocketIO] Send SMS response error:', error)
      }
    })

    // SMS delivery status handler (for bulk SMS)
    socket.on('sms_delivery_status', async (data: any) => {
      try {
        // Parse JSON data if it's a string
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data

        const { deviceId, messageId, campaignId, bulkMessageId, delivered, simSlot } = parsedData

        console.log(`[SocketIO] SMS delivery status: ${deviceId} - campaign=${campaignId} - message=${bulkMessageId} - ${delivered ? 'delivered' : 'not delivered'}`)

        // Update bulk message status in database
        if (campaignId && bulkMessageId) {
          const prisma = (await import('../db/prisma')).prisma

          await prisma.bulkMessage.update({
            where: { id: bulkMessageId },
            data: {
              status: delivered ? 'delivered' : 'sent',
              deliveredAt: delivered ? new Date() : null,
            },
          })

          // Update campaign delivered count
          if (delivered) {
            await prisma.bulkCampaign.update({
              where: { id: campaignId },
              data: {
                deliveredCount: { increment: 1 },
              },
            })
          }
        }

        // Broadcast to dashboard
        this.broadcastToDashboard('sms_delivery_update', {
          deviceId,
          messageId,
          campaignId,
          bulkMessageId,
          delivered,
          simSlot,
          timestamp: new Date()
        })

      } catch (error) {
        console.error('[SocketIO] SMS delivery status error:', error)
      }
    })

    console.log(`[SocketIO] Device connected: ${deviceId || connectionId}`)
  }

  private handleDashboardConnection(socket: any) {
    this.dashboardClients.add(socket.id)

    // Mark socket as dashboard
    socket.data = socket.data || {}
    socket.data.isDashboard = true

    console.log(`[SocketIO] Dashboard client connected: ${socket.id}`)

    // Send current device status to new dashboard client
    this.sendDeviceStatus(socket)

    socket.on('disconnect', () => {
      this.dashboardClients.delete(socket.id)
      console.log(`[SocketIO] Dashboard client disconnected: ${socket.id}`)
    })
  }

  private handleDisconnect(socket: any) {
    const connectionId = socket.id

    // Find and remove device connection
    for (const [deviceId, socketId] of this.deviceConnections) {
      if (socketId === connectionId) {
        this.deviceConnections.delete(deviceId)
        console.log(`[SocketIO] Device disconnected: ${deviceId}, socket: ${connectionId}`)
        console.log(`[SocketIO] Active device connections: ${this.deviceConnections.size}`)

        // Reject all pending requests for this device
        this.rejectPendingRequestsForDevice(deviceId, 'Device disconnected')

        // Broadcast to dashboard
        this.broadcastToDashboard('device_offline', {
          deviceId,
          timestamp: new Date()
        })

        return
      }
    }

    // Check if this was a pending connection (not yet registered)
    if (socket.data?.pendingDeviceId) {
      console.log(`[SocketIO] Unregistered device disconnected: ${socket.data.pendingDeviceId}, socket: ${connectionId}`)
    }
  }

  private broadcastToDashboard(event: string, data: any) {
    this.dashboardClients.forEach((socketId) => {
      this.io.to(socketId).emit(event, data)
    })
  }

  private async sendDeviceStatus(socket: any) {
    try {
      const devices = await prisma.device.findMany({
        where: { isActive: true },
        select: {
          deviceId: true,
          name: true,
          status: true,
          lastHeartbeat: true,
          signalStrength: true,
          batteryLevel: true
        },
        take: 100,
        orderBy: { lastHeartbeat: 'desc' }
      })

      socket.emit('devices_status', { devices })
    } catch (error) {
      console.error('[SocketIO] Error sending device status:', error)
    }
  }

  // ─── Public methods for external use ─────────────────────────────────────────

  /**
   * Send command to device and wait for response (with timeout)
   * Returns a promise that resolves when the device responds
   */
  sendCommandAndWait<T = any>(
    deviceId: string,
    event: string,
    data: any,
    timeoutMs: number = this.REQUEST_TIMEOUT
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check if device is connected
      if (!this.isDeviceConnected(deviceId)) {
        return reject(new Error(`Device ${deviceId} is not connected`))
      }

      // Generate unique request ID
      const requestId = randomUUID()

      // Add requestId to the data payload
      const dataWithRequestId = { ...data, requestId }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Request timeout: Device did not respond within ${timeoutMs}ms`))
      }, timeoutMs)

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        createdAt: new Date(),
        deviceId,
        command: event
      })

      // Send command to device
      const success = this.sendToDevice(deviceId, event, dataWithRequestId)

      if (!success) {
        // Clean up if send failed
        clearTimeout(timeout)
        this.pendingRequests.delete(requestId)
        reject(new Error(`Failed to send command to device ${deviceId}`))
      }

      console.log(`[SocketIO] Command sent: ${deviceId} - ${event} (requestId: ${requestId})`)
    })
  }

  /**
   * Send command to device without waiting for response (fire and forget)
   */
  sendToDevice(deviceId: string, event: string, data: any): boolean {
    const socketId = this.deviceConnections.get(deviceId)
    if (socketId) {
      this.io.to(socketId).emit(event, data)
      return true
    }
    return false
  }

  getConnectedDevices(): string[] {
    return Array.from(this.deviceConnections.keys())
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.deviceConnections.has(deviceId)
  }

  getDashboardClientCount(): number {
    return this.dashboardClients.size
  }

  private async ensureDbConnection() {
    // Prisma handles connection management automatically
    // This method exists for compatibility with legacy code structure
    // No manual connection needed for Prisma + MongoDB
  }

  private formatSims(sims: any[]): any[] {
    if (!sims || !Array.isArray(sims)) return []
    return sims.map((sim) => ({
      slot: sim.slot,
      phoneNumber: sim.phoneNumber || sim.number || null,
      carrier: sim.carrier || sim.carrierName || null,
      signalStrength: sim.signalStrength || 0,
      networkType: sim.networkType || null,
      country: sim.country || null,
      isActive: sim.isActive || false,
    }))
  }

  private sanitizeBatteryLevel(level: any): number | null {
    if (level === null || level === undefined) return null
    const num = Number(level)
    if (isNaN(num)) return null
    if (num < 0 || num > 100) return null
    return num
  }

  // ─── Request-Response Management ─────────────────────────────────────────────

  /**
   * Resolve a pending request with data
   */
  private resolveRequest<T>(requestId: string, data: T): void {
    const pending = this.pendingRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(requestId)
      pending.resolve(data)
      console.log(`[SocketIO] Request resolved: ${requestId} (${this.pendingRequests.size} pending)`)
    }
  }

  /**
   * Reject a pending request with error
   */
  private rejectRequest(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(requestId)
      pending.reject(error)
      console.log(`[SocketIO] Request rejected: ${requestId} - ${error.message}`)
    }
  }

  /**
   * Reject all pending requests for a specific device
   * Called when device disconnects
   */
  private rejectPendingRequestsForDevice(deviceId: string, reason: string): void {
    const rejected: string[] = []

    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.deviceId === deviceId) {
        clearTimeout(pending.timeout)
        pending.reject(new Error(reason))
        rejected.push(requestId)
      }
    }

    // Remove rejected requests
    rejected.forEach(id => this.pendingRequests.delete(id))

    if (rejected.length > 0) {
      console.log(`[SocketIO] Rejected ${rejected.length} pending requests for device ${deviceId}`)
    }
  }

  /**
   * Get count of pending requests (for debugging/monitoring)
   */
  getPendingRequestsCount(): number {
    return this.pendingRequests.size
  }

  /**
   * Clean up old pending requests (should be called periodically)
   * Removes requests older than 2 minutes
   */
  cleanupOldPendingRequests(): void {
    const now = new Date()
    const stale: string[] = []

    for (const [requestId, pending] of this.pendingRequests) {
      const age = now.getTime() - pending.createdAt.getTime()
      if (age > 120000) { // 2 minutes
        clearTimeout(pending.timeout)
        pending.reject(new Error('Request expired'))
        stale.push(requestId)
      }
    }

    stale.forEach(id => this.pendingRequests.delete(id))

    if (stale.length > 0) {
      console.log(`[SocketIO] Cleaned up ${stale.length} stale pending requests`)
    }
  }
}

// Global instance accessor
let globalSocketManager: SocketIOManager | null = null

export function initSocketIO(httpServer: HTTPServer): SocketIOManager {
  if (!globalSocketManager) {
    globalSocketManager = new SocketIOManager(httpServer)
  }
  return globalSocketManager
}

export function getSocketManager(): SocketIOManager | null {
  return globalSocketManager
}
