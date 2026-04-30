import { z } from "zod"
import { router, publicProcedure, protectedProcedure } from "./index"
import { prisma } from "../db/prisma"
import { getSocketManager } from "../websocket/manager"

export const appRouter = router({
  // Health check
  health: publicProcedure.query(() => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })),

  // Get current user session
  session: publicProcedure.query(({ ctx }) => ({
    user: ctx.session?.user || null,
    isAuthenticated: !!ctx.session
  })),

  // Get user profile (protected)
  me: protectedProcedure.query(({ ctx }) => ({
    user: ctx.session?.user
  })),

  // Example: Update user name (protected)
  updateName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session?.user?.id) {
        throw new Error('User not authenticated')
      }

      const updatedUser = await prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { name: input.name }
      })

      return {
        user: updatedUser
      }
    }),

  // Get current user's API key (protected)
  getApiKey: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.session?.user?.id) {
        throw new Error('User not authenticated')
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { apiKey: true }
      })

      return { apiKey: user?.apiKey || null }
    }),

  // Regenerate API key (protected)
  regenerateApiKey: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.session?.user?.id) {
        throw new Error('User not authenticated')
      }

      const { generateApiKeyForUser } = await import('../lib/api-key')
      const newApiKey = await generateApiKeyForUser(ctx.session.user.id)

      return { apiKey: newApiKey }
    }),

  // Validate API key (for testing/admin - can be made protected if needed)
  validateApiKey: publicProcedure
    .input(z.object({ apiKey: z.string() }))
    .query(async ({ input }) => {
      const { validateApiKey } = await import('../lib/api-key')
      const result = await validateApiKey(input.apiKey)

      return {
        valid: result.valid,
        userId: result.user?.id || null,
        email: result.user?.email || null
      }
    }),

  // ============================================
  // DEVICE MANAGEMENT
  // ============================================
  device: router({
    list: publicProcedure
      .input(z.object({
        status: z.enum(['online', 'offline', 'all']).default('all'),
        limit: z.number().default(50),
        offset: z.number().default(0)
      }).optional())
      .query(async ({ input }) => {
        const params = input || { status: 'all' as const, limit: 50, offset: 0 }

        // Get all devices first (we'll filter by actual online status after)
        const allDevices = await prisma.device.findMany({
          take: params.limit ?? 50,
          skip: params.offset ?? 0,
          orderBy: { lastHeartbeat: 'desc' }
        })

        // Calculate real online status based on lastSeen (2 minutes threshold)
        const ONLINE_THRESHOLD_MS = 120000 // 2 minutes
        const now = Date.now()

        const devicesWithRealStatus = allDevices.map(device => {
          const lastSeen = new Date(device.lastSeen).getTime()
          const isActuallyOnline = (now - lastSeen) < ONLINE_THRESHOLD_MS
          return {
            ...device,
            status: isActuallyOnline ? 'online' : 'offline',
            isActuallyOnline
          }
        })

        // Filter by requested status based on REAL online status
        if (params.status !== 'all') {
          return devicesWithRealStatus.filter(d => d.isActuallyOnline === (params.status === 'online'))
        }

        return devicesWithRealStatus
      }),

    getById: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(async ({ input }) => {
        const device = await prisma.device.findUnique({
          where: { deviceId: input.deviceId }
        })

        if (!device) return null

        // Calculate real online status based on lastSeen (2 minutes threshold)
        const ONLINE_THRESHOLD_MS = 120000 // 2 minutes
        const lastSeen = new Date(device.lastSeen).getTime()
        const isActuallyOnline = (Date.now() - lastSeen) < ONLINE_THRESHOLD_MS

        return {
          ...device,
          status: isActuallyOnline ? 'online' : 'offline'
        }
      }),

    sendSms: publicProcedure
      .input(z.object({
        deviceId: z.string(),
        phoneNumber: z.string(),
        message: z.string().min(1),
        simSlot: z.number().default(0)
      }))
      .mutation(async ({ input }) => {
        const socketManager = getSocketManager()
        if (!socketManager) {
          throw new Error('Socket manager not available')
        }

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

        const success = socketManager.sendToDevice(
          input.deviceId,
          'send_sms',
          {
            messageId,
            phoneNumber: input.phoneNumber,
            message: input.message,
            simSlot: input.simSlot
          }
        )

        if (!success) {
          throw new Error('Device not connected')
        }

        return {
          success: true,
          messageId,
          message: 'SMS sent to device'
        }
      }),

    toggleCallForwarding: publicProcedure
      .input(z.object({
        deviceId: z.string(),
        simSlot: z.number(),
        action: z.enum(['forward', 'deactivate', 'check']),
        phoneNumber: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const socketManager = getSocketManager()
        if (!socketManager) {
          throw new Error('Socket manager not available')
        }

        try {
          // Send command and wait for device response (30 second timeout)
          const response = await socketManager.sendCommandAndWait<{
            success: boolean
            action: string
            simSlot: number
            phoneNumber?: string
            error?: string
            ussdResponse?: string
          }>(
            input.deviceId,
            'call_forwarding',
            {
              simSlot: input.simSlot,
              action: input.action,
              phoneNumber: input.phoneNumber
            },
            30000 // 30 second timeout
          )

          return {
            success: response.success,
            action: response.action,
            simSlot: response.simSlot,
            phoneNumber: response.phoneNumber,
            error: response.error,
            ussdResponse: response.ussdResponse
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(error.message)
          }
          throw new Error('Call forwarding request failed')
        }
      }),

    wakeUp: publicProcedure
      .input(z.object({ deviceId: z.string() }))
      .mutation(async ({ input }) => {
        const device = await prisma.device.findUnique({
          where: { deviceId: input.deviceId }
        })

        if (!device?.fcmToken) {
          throw new Error('Device has no FCM token')
        }

        // Send FCM notification (implementation depends on Firebase setup)
        // For now, update the wakeup attempt timestamp
        await prisma.device.update({
          where: { deviceId: input.deviceId },
          data: { lastWakeupAttempt: new Date() }
        })

        return {
          success: true,
          message: 'Wake-up signal sent'
        }
      })
  }),

  // ============================================
  // NUMBERS MANAGEMENT
  // ============================================
  numbers: router({
    list: publicProcedure
      .input(z.object({
        active: z.boolean().optional(),
        suspended: z.boolean().optional(),
        countryid: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
        search: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const params = input || { limit: 50, offset: 0 }
        const where: any = {}

        if (params.active !== undefined) where.active = params.active
        if (params.suspended !== undefined) where.suspended = params.suspended
        if (params.countryid) where.countryid = params.countryid
        if (params.search) {
          where.number = { contains: params.search }
        }

        return await prisma.numbers.findMany({
          where,
          take: params.limit,
          skip: params.offset,
          orderBy: { updatedAt: 'desc' }
        })
      }),

    getByNumber: publicProcedure
      .input(z.object({ number: z.number() }))
      .query(async ({ input }) => {
        return await prisma.numbers.findUnique({
          where: { number: input.number }
        })
      }),

    updateQuality: protectedProcedure
      .input(z.object({
        number: z.number(),
        qualityScore: z.number().min(0).max(100),
        suspended: z.boolean().optional(),
        suspensionReason: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const updateData: any = {
          qualityScore: input.qualityScore
        }

        if (input.suspended !== undefined) {
          updateData.suspended = input.suspended
          updateData.suspensionReason = input.suspensionReason || 'manual'
          updateData.suspendedAt = input.suspended ? new Date() : null
        }

        return await prisma.numbers.update({
          where: { number: input.number },
          data: updateData
        })
      }),

    bulkAction: protectedProcedure
      .input(z.object({
        numbers: z.array(z.number()),
        action: z.enum(['suspend', 'recover', 'reset']),
        reason: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const updates = input.numbers.map(number => {
          let data: any = {}

          switch (input.action) {
            case 'suspend':
              data = {
                suspended: true,
                suspensionReason: input.reason || 'manual',
                suspendedAt: new Date()
              }
              break
            case 'recover':
              data = {
                suspended: false,
                suspensionReason: 'none',
                suspendedAt: null,
                consecutiveFailures: 0
              }
              break
            case 'reset':
              data = {
                qualityScore: 100,
                suspended: false,
                suspensionReason: 'none',
                suspendedAt: null,
                consecutiveFailures: 0,
                failureCount: 0,
                successCount: 0
              }
              break
          }

          return prisma.numbers.update({
            where: { number },
            data
          })
        })

        await Promise.all(updates)

        return {
          success: true,
          count: input.numbers.length,
          action: input.action
        }
      }),

    quality: publicProcedure
      .input(z.object({
        filter: z.enum(['all', 'suspended', 'warning', 'active']).default('all'),
        page: z.number().default(1),
        limit: z.number().default(50)
      }))
      .query(async ({ input }) => {
        const { filter, page, limit } = input
        const skip = (page - 1) * limit

        // Build where clause based on filter
        let where: any = {}

        switch (filter) {
          case 'suspended':
            where.suspended = true
            break
          case 'warning':
            where.suspended = false
            where.qualityScore = { lt: 50 } // Warning if quality score < 50
            break
          case 'active':
            where.active = true
            where.suspended = false
            break
          // 'all' - no filters
        }

        const [numbers, totalCount] = await Promise.all([
          prisma.numbers.findMany({
            where,
            take: limit,
            skip,
            orderBy: { updatedAt: 'desc' }
          }),
          prisma.numbers.count({ where })
        ])

        // Calculate stats
        const stats = {
          totalCount,
          activeCount: await prisma.numbers.count({ where: { active: true } }),
          suspendedCount: await prisma.numbers.count({ where: { suspended: true } }),
          avgQuality: await prisma.numbers.aggregate({
            _avg: { qualityScore: true }
          }).then(result => result._avg.qualityScore || 0)
        }

        return {
          success: true,
          data: numbers,
          pagination: {
            page,
            limit,
            total: totalCount,
            pages: Math.ceil(totalCount / limit)
          },
          stats
        }
      }),

    add: protectedProcedure
      .input(z.object({
        number: z.number().int().positive(),
        countryid: z.string(),
        multiuse: z.boolean().default(false),
        active: z.boolean().default(true)
      }))
      .mutation(async ({ input }) => {
        // Check for duplicate number
        const existing = await prisma.numbers.findFirst({
          where: { number: input.number }
        })

        if (existing) {
          throw new Error('Number already exists')
        }

        const number = await prisma.numbers.create({
          data: {
            number: input.number,
            countryid: input.countryid,
            active: input.active,
            qualityScore: 100,
            suspended: false,
            locked: false,
            multiuse: input.multiuse,
            failureCount: 0,
            successCount: 0,
            consecutiveFailures: 0
          }
        })

        return { success: true, number }
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.string()
      }))
      .mutation(async ({ input }) => {
        await prisma.numbers.delete({
          where: { id: input.id }
        })

        return {
          success: true,
          message: 'Number deleted successfully'
        }
      })
  }),

  // ============================================
  // ORDERS MANAGEMENT
  // ============================================
  orders: router({
    // ============================================
    // LEGACY API (PHP-compatible)
    // ============================================
    buyNumber: publicProcedure
      .input(z.object({
        api_key: z.string(),
        service: z.string(),
        country: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        const { buyNumber } = await import('../api/legacy-orders')
        return await buyNumber({ input, ctx })
      }),

    getSms: publicProcedure
      .input(z.object({
        api_key: z.string(),
        id: z.string()
      }))
      .query(async ({ input, ctx }) => {
        const { getSms } = await import('../api/legacy-orders')
        return await getSms({ input, ctx })
      }),

    setCancel: publicProcedure
      .input(z.object({
        api_key: z.string(),
        id: z.string(),
        status: z.number() // 8 = cancel, 3 = next/retry
      }))
      .mutation(async ({ input, ctx }) => {
        const { setCancel } = await import('../api/legacy-orders')
        return await setCancel({ input, ctx })
      }),

    // ============================================
    // DASHBOARD ORDERS (display only)
    // ============================================
    list: publicProcedure
      .input(z.object({
        active: z.boolean().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const params = input
        const where: any = {}

        if (params.active !== undefined) {
          where.active = params.active
        }

        if (params.search) {
          where.OR = [
            { number: { contains: params.search } },
          ]
        }

        const orders = await prisma.orders.findMany({
          where,
          take: params.limit,
          skip: params.offset,
          orderBy: { createdAt: 'desc' }
        })

        // Populate country and service data
        const ordersWithDetails = await Promise.all(
          orders.map(async (order) => {
            const [country, service] = await Promise.all([
              prisma.country.findFirst({ where: { id: order.countryid } }),
              prisma.service.findFirst({ where: { id: order.serviceid } })
            ])

            return {
              ...order,
              country: country?.name || 'Unknown',
              service: service?.name || 'Unknown',
              countryData: country,
              serviceData: service
            }
          })
        )

        return ordersWithDetails
      }),

    getById: publicProcedure
      .input(z.object({ orderId: z.string() }))
      .query(async ({ input }) => {
        return await prisma.orders.findUnique({
          where: { id: input.orderId }
        })
      }),

    create: publicProcedure
      .input(z.object({
        countryid: z.string(),
        serviceid: z.string(),
        dialcode: z.number()
      }))
      .mutation(async ({ input }) => {
        // Smart number allocation logic
        // Find available number for this country/service
        const availableNumbers = await prisma.numbers.findMany({
          where: {
            countryid: input.countryid,
            active: true,
            suspended: false,
            locked: false
          },
          take: 20
        })

        // Filter out numbers with active orders
        const numbersWithOrders = await prisma.orders.findMany({
          where: {
            active: true,
            number: { in: availableNumbers.map(n => n.number) }
          },
          select: { number: true }
        })

        const availableNumbersFiltered = availableNumbers.filter(
          n => !numbersWithOrders.find(o => o.number === n.number)
        )

        if (availableNumbersFiltered.length === 0) {
          throw new Error('No available numbers')
        }

        // Select random number
        const selectedNumber = availableNumbersFiltered[
          Math.floor(Math.random() * availableNumbersFiltered.length)
        ]!

        // Get service details
        const service = await prisma.service.findUnique({
          where: { id: input.serviceid }
        })

        if (!service) {
          throw new Error('Service not found')
        }

        // Create order
        const order = await prisma.orders.create({
          data: {
            number: selectedNumber.number,
            countryid: input.countryid,
            serviceid: input.serviceid,
            dialcode: input.dialcode,
            active: true,
            message: [],
            format: service.format || [],
            maxmessage: service.maxmessage,
            ismultiuse: service.multisms,
            nextsms: false
          }
        })

        return {
          success: true,
          order,
          number: selectedNumber.number
        }
      }),

    getStatus: publicProcedure
      .input(z.object({ orderId: z.string() }))
      .query(async ({ input }) => {
        const order = await prisma.orders.findUnique({
          where: { id: input.orderId }
        })

        if (!order) {
          throw new Error('Order not found')
        }

        const messages = order.message as any[] || []

        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1]
          return {
            status: 'STATUS_OK',
            otp: lastMessage,
            isused: order.isused,
            active: order.active
          }
        }

        return {
          status: 'STATUS_WAIT_CODE',
          active: order.active
        }
      }),

    cancel: publicProcedure
      .input(z.object({
        orderId: z.string(),
        status: z.enum(['cancel', 'next'])
      }))
      .mutation(async ({ input }) => {
        if (input.status === 'cancel') {
          await prisma.orders.update({
            where: { id: input.orderId },
            data: {
              active: false,
              failureReason: 'cancelled'
            }
          })

          return { success: true, action: 'cancelled' }
        } else {
          await prisma.orders.update({
            where: { id: input.orderId },
            data: { nextsms: true }
          })

          return { success: true, action: 'next_sms' }
        }
      })
  }),

  // ============================================
  // MESSAGES
  // ============================================
  messages: router({
    list: publicProcedure
      .input(z.object({
        receiver: z.string().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0)
      }).optional())
      .query(async ({ input }) => {
        const params = input || { limit: 100, offset: 0 }
        const where = params.receiver ? { receiver: params.receiver } : {}

        return await prisma.message.findMany({
          where,
          take: params.limit,
          skip: params.offset,
          orderBy: { time: 'desc' }
        })
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.string()
      }))
      .mutation(async ({ input }) => {
        console.log('[Messages] Deleting message:', input.id)
        await prisma.message.delete({
          where: { id: input.id }
        })

        console.log('[Messages] Message deleted successfully:', input.id)
        return {
          success: true,
          message: 'Message deleted successfully'
        }
      })
  }),

  // ============================================
  // REFERENCE DATA
  // ============================================
  countries: router({
    all: publicProcedure.query(async () => {
      return await prisma.country.findMany({
        where: { active: true },
        orderBy: { name: 'asc' }
      })
    }),

    add: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        flag: z.string().min(1),
        code: z.string().min(1),
        dialcode: z.number().int().positive(),
        active: z.boolean().default(true)
      }))
      .mutation(async ({ input }) => {
        // Check for duplicate country code
        const existing = await prisma.country.findFirst({
          where: { code: input.code }
        })

        if (existing) {
          throw new Error('Country code already exists')
        }

        const country = await prisma.country.create({
          data: input
        })

        return { success: true, country }
      }),

    edit: protectedProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1),
        flag: z.string().min(1),
        code: z.string().min(1),
        dialcode: z.number().int().positive(),
        active: z.boolean()
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input

        const updated = await prisma.country.update({
          where: { id },
          data
        })

        if (!updated) {
          throw new Error('Country not found')
        }

        return { success: true, country: updated }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await prisma.country.delete({
          where: { id: input.id }
        })

        return { success: true, message: 'Country deleted' }
      })
  }),

  services: router({
    all: publicProcedure.query(async () => {
      return await prisma.service.findMany({
        where: { active: true },
        orderBy: { name: 'asc' }
      })
    }),

    add: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        code: z.string().min(1),
        format: z.array(z.any()),
        image: z.string().min(1),
        multisms: z.boolean().default(true),
        maxmessage: z.number().int().default(0),
        active: z.boolean().default(true)
      }))
      .mutation(async ({ input }) => {
        // Check for duplicate service code
        const existing = await prisma.service.findFirst({
          where: { code: input.code }
        })

        if (existing) {
          throw new Error('Service code already exists')
        }

        const service = await prisma.service.create({
          data: input
        })

        return { success: true, service }
      }),

    edit: protectedProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1),
        code: z.string().min(1),
        format: z.array(z.any()),
        image: z.string().min(1),
        multisms: z.boolean(),
        maxmessage: z.number().int(),
        active: z.boolean()
      }))
      .mutation(async ({ input }) => {
        const { id, code, ...data } = input
        console.log('[Services] Edit request received for service:', id, 'new name:', input.name)

        // Check for duplicate code (excluding current service)
        const existing = await prisma.service.findFirst({
          where: { code, id: { not: id } }
        })

        if (existing) {
          console.log('[Services] Edit failed: Service code already exists:', code)
          throw new Error('Service code already exists')
        }

        const updated = await prisma.service.update({
          where: { id },
          data: { ...data, code }
        })

        if (!updated) {
          console.log('[Services] Edit failed: Service not found:', id)
          throw new Error('Service not found')
        }

        console.log('[Services] Service updated successfully:', id)
        return { success: true, service: updated }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        console.log('[Services] Delete request received for service:', input.id)
        await prisma.service.delete({
          where: { id: input.id }
        })

        console.log('[Services] Service deleted successfully:', input.id)
        return { success: true, message: 'Service deleted' }
      })
  }),

  locks: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
        service: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const { limit = 50, offset = 0, service } = input || {}
        const where: any = {}

        if (service && service !== 'All') {
          where.serviceid = service
        }

        const locks = await prisma.lock.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        })

        // Populate country and service data
        const locksWithData = await Promise.all(
          locks.map(async (lock) => {
            const [country, service] = await Promise.all([
              prisma.country.findFirst({ where: { id: lock.countryid } }),
              prisma.service.findFirst({ where: { id: lock.serviceid } })
            ])

            return {
              _id: lock.id?.toString() || '',
              id: lock.id?.toString() || '',
              number: lock.number,
              country: country?.name || 'Unknown',
              service: service?.name || 'Unknown',
              serviceid: lock.serviceid,
              countryid: lock.countryid,
              locked: lock.locked,
              createdAt: lock.createdAt,
              updatedAt: lock.updatedAt
            }
          })
        )

        return locksWithData
      }),

    unlock: protectedProcedure
      .input(z.object({
        id: z.string()
      }))
      .mutation(async ({ input }) => {
        // Find the lock first to get the data
        const lock = await prisma.lock.findUnique({
          where: { id: input.id }
        })

        if (!lock) {
          throw new Error('Lock not found')
        }

        // Delete lock and clear cooldown state for this number/service/country
        const [lockResult] = await Promise.all([
          prisma.lock.deleteMany({
            where: { id: input.id }
          }),
          // Clear cooldown for associated orders
          prisma.orders.updateMany({
            where: {
              number: lock.number,
              countryid: lock.countryid,
              serviceid: lock.serviceid,
              active: false,
              cooldownUntil: { not: null }
            },
            data: { cooldownUntil: null }
          })
        ])

        return {
          success: true,
          count: lockResult.count,
          message: `Unlocked ${lockResult.count} lock(s) and cleared cooldown`
        }
      }),

    unlockAll: protectedProcedure
      .input(z.object({ serviceid: z.string() }))
      .mutation(async ({ input }) => {
        // Find all locks for this service first
        const locks = await prisma.lock.findMany({
          where: { serviceid: input.serviceid }
        })

        // Delete locks and clear cooldown states
        const [lockResult] = await Promise.all([
          prisma.lock.deleteMany({
            where: { serviceid: input.serviceid }
          }),
          // Clear cooldown for all affected orders
          ...locks.map(lock =>
            prisma.orders.updateMany({
              where: {
                number: lock.number,
                countryid: lock.countryid,
                serviceid: lock.serviceid,
                active: false,
                cooldownUntil: { not: null }
              },
              data: { cooldownUntil: null }
            })
          )
        ])

        return {
          success: true,
          count: lockResult.count,
          message: `Unlocked ${lockResult.count} lock(s) and cleared cooldown for service`
        }
      })
  }),

  overview: router({
    activation: publicProcedure.query(async () => {
      const now = new Date()
      const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000))
      const startOfDay = new Date(now.setHours(0, 0, 0, 0))

      // Get basic stats
      const [totalNumbers, activeNumbers, suspendedNumbers, todayOrdersData, totalDevices, allDevices, activeOrdersCount] = await Promise.all([
        prisma.numbers.count(),
        prisma.numbers.count({ where: { active: true, suspended: false } }),
        prisma.numbers.count({ where: { suspended: true } }),
        prisma.orders.findMany({
          where: {
            createdAt: { gte: startOfDay }
          },
          select: { isused: true, active: true }
        }),
        prisma.device.count(),
        prisma.device.findMany({ select: { deviceId: true, lastSeen: true, status: true } }),
        prisma.orders.count({ where: { active: true } }) // Real active orders count
      ])

      // Calculate today's order statistics
      const todayTotal = todayOrdersData.length
      const todaySuccess = todayOrdersData.filter(o => o.isused).length
      const todayCanceled = todayOrdersData.filter(o => !o.active && !o.isused).length
      const successRate = todayTotal > 0 ? Math.round((todaySuccess / todayTotal) * 100) : 0

      // Calculate actually online devices (lastSeen within 2 minutes)
      const ONLINE_THRESHOLD_MS = 120000 // 2 minutes
      const currentTime = Date.now()
      const activeDevices = allDevices.filter(d => {
        const lastSeen = new Date(d.lastSeen).getTime()
        return (currentTime - lastSeen) < ONLINE_THRESHOLD_MS
      }).length

      // Get cron status - both device sync and OTP fetch times
      const [syncCron, fetchCron] = await Promise.all([
        prisma.cron.findFirst({ where: { name: 'syncStatus' } }),
        prisma.cron.findFirst({ where: { name: 'fetchOrders' } })
      ])

      return {
        totalNumbers,
        activeNumbers,
        suspendedNumbers,
        todayOrders: todayTotal,
        todaySuccess,
        todayCanceled,
        successRate,
        totalDevices,
        activeDevices,
        activeOrders: activeOrdersCount,
        lastDeviceSync: syncCron?.lastRun || null,
        lastOtpFetch: fetchCron?.lastRun || null,
        istTime: istDate.toISOString()
      }
    }),

    chart: publicProcedure
      .input(z.object({
        days: z.number().default(7)
      }).optional())
      .query(async ({ input }) => {
        const days = input?.days ?? 7
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - (days - 1))
        startDate.setHours(0, 0, 0, 0)

        const orders = await prisma.orders.findMany({
          where: {
            createdAt: { gte: startDate, lte: today }
          },
          orderBy: { createdAt: 'asc' }
        })

        // Group by date with success/cancel breakdown
        const chartData = []
        for (let i = 0; i < days; i++) {
          const date = new Date(startDate)
          date.setDate(date.getDate() + i)

          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt)
            return orderDate.toDateString() === date.toDateString()
          })

          const success = dayOrders.filter(o => o.isused).length
          const canceled = dayOrders.filter(o => !o.active && !o.isused).length

          chartData.push({
            date: date.toISOString().split('T')[0],
            success,
            canceled,
            total: dayOrders.length
          })
        }

        return chartData
      }),

    data: publicProcedure
      .input(z.object({
        limit: z.number().default(100),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional())
      .query(async ({ input }) => {
        const params = input ?? { limit: 100 }
        const where: any = {}

        if (params.startDate) {
          where.createdAt = { gte: new Date(params.startDate) }
        }

        if (params.endDate) {
          where.createdAt = { ...where.createdAt, lte: new Date(params.endDate) }
        }

        const orders = await prisma.orders.findMany({
          where,
          take: params.limit,
          orderBy: { createdAt: 'desc' }
        })

        // Populate country and service data
        const ordersWithDetails = await Promise.all(
          orders.map(async (order) => {
            const [country, service] = await Promise.all([
              prisma.country.findFirst({ where: { id: order.countryid } }),
              prisma.service.findFirst({ where: { id: order.serviceid } })
            ])

            return {
              ...order,
              country,
              service
            }
          })
        )

        return ordersWithDetails
      }),

    today: publicProcedure.query(async () => {
      const now = new Date()
      const startOfDay = new Date(now.setHours(0, 0, 0, 0))

      const orders = await prisma.orders.findMany({
        where: {
          createdAt: { gte: startOfDay }
        },
        orderBy: { createdAt: 'asc' }
      })

      // Group by hour with success/cancel breakdown
      const hourlyData = Array.from({ length: 24 }, (_, hour) => {
        const hourOrders = orders.filter(order => {
          const orderHour = new Date(order.createdAt).getHours()
          return orderHour === hour
        })

        const success = hourOrders.filter(o => o.isused).length
        const canceled = hourOrders.filter(o => !o.active && !o.isused).length

        return {
          hour: `${hour.toString().padStart(2, '0')}:00`,
          success,
          canceled,
          total: hourOrders.length
        }
      })

      return hourlyData
    }),

    activeOrders: protectedProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0)
      }).optional())
      .query(async ({ input }) => {
        const params = input ?? { limit: 20, offset: 0 }

        const orders = await prisma.orders.findMany({
          where: { active: true },
          take: params.limit,
          skip: params.offset,
          orderBy: { createdAt: 'desc' }
        })

        // Populate service data
        const ordersWithService = await Promise.all(
          orders.map(async (order) => {
            const service = await prisma.service.findFirst({
              where: { id: order.serviceid }
            })

            return {
              ...order,
              service
            }
          })
        )

        return ordersWithService
      })
  }),

  // ============================================
  // BULK SMS
  // ============================================
  bulkSms: router({
    createCampaign: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        message: z.string().min(1),
        recipients: z.array(z.string().min(10)),
        devicePool: z.array(z.string()).optional(),
        strategy: z.enum(['round-robin', 'load-balanced', 'priority']).default('round-robin'),
        scheduledAt: z.string().datetime().optional(),
        webhookUrl: z.string().url().optional(),
        simSlot: z.union([z.number(), z.literal('both')]).default('both'),
      }))
      .mutation(async ({ input }) => {
        const { createCampaign } = await import('../api/bulk-sms')
        return createCampaign({ input, ctx: {} })
      }),

    getCampaignStatus: publicProcedure
      .input(z.object({
        campaignId: z.string(),
      }))
      .query(async ({ input }) => {
        const { getCampaignStatus } = await import('../api/bulk-sms')
        return getCampaignStatus({ input, ctx: {} })
      }),

    cancelCampaign: publicProcedure
      .input(z.object({
        campaignId: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { cancelCampaign } = await import('../api/bulk-sms')
        return cancelCampaign({ input, ctx: {} })
      }),

    getMessageStatus: publicProcedure
      .input(z.object({
        campaignId: z.string(),
        messageId: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getMessageStatus } = await import('../api/bulk-sms')
        return getMessageStatus({ input, ctx: {} })
      }),

    listCampaigns: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { listCampaigns } = await import('../api/bulk-sms')
        return listCampaigns({ input, ctx: {} })
      }),
  }),

  // ============================================
  // QUEUE MONITORING
  // ============================================
  queues: router({
    stats: publicProcedure.query(async () => {
      const { getAllQueueStats } = await import('../queues')
      return await getAllQueueStats()
    }),

    dlq: publicProcedure
      .input(z.object({
        queue: z.string().optional(),
        limit: z.number().default(50)
      }))
      .query(async ({ input }) => {
        // Retrieve failed jobs from dead letter queue
        // Implementation depends on BullMQ DLQ setup
        return {
          queue: input.queue || 'all',
          failed: [],
          limit: input.limit
        }
      })
  }),

  // ============================================
  // ANALYTICS DASHBOARD
  // ============================================
  analytics: router({
    // Dashboard summary (overview panel)
    getDashboardSummary: publicProcedure.query(async () => {
      const { getDashboardSummary } = await import('../api/analytics')
      return await getDashboardSummary()
    }),

    // Delivery rate trend (24-hour chart)
    getDeliveryRateTrend: publicProcedure.query(async () => {
      const { getDeliveryRateTrend } = await import('../api/analytics')
      return await getDeliveryRateTrend()
    }),

    // Device performance comparison
    getDevicePerformance: publicProcedure.query(async () => {
      const { getDevicePerformance } = await import('../api/analytics')
      return await getDevicePerformance()
    }),

    // Error breakdown
    getErrorBreakdown: publicProcedure
      .input(z.object({
        timeRange: z.object({
          startDate: z.string().datetime(),
          endDate: z.string().datetime()
        }).optional()
      }))
      .query(async ({ input }) => {
        const { getErrorBreakdown } = await import('../api/analytics')
        const range = input.timeRange ? {
          startDate: new Date(input.timeRange.startDate),
          endDate: new Date(input.timeRange.endDate)
        } : undefined
        return await getErrorBreakdown(range)
      }),

    // Throughput metrics (per minute for last hour)
    getThroughputMetrics: publicProcedure.query(async () => {
      const { getThroughputMetrics } = await import('../api/analytics')
      return await getThroughputMetrics()
    }),

    // Campaign performance list
    getCampaignPerformance: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0)
      }))
      .query(async ({ input }) => {
        const { getCampaignPerformance } = await import('../api/analytics')
        return await getCampaignPerformance(input.limit, input.offset)
      }),

    // Active campaigns (currently running)
    getActiveCampaigns: publicProcedure.query(async () => {
      const { getActiveCampaigns } = await import('../api/analytics')
      return await getActiveCampaigns()
    }),

    // Recent activity feed
    getRecentActivity: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).default(50)
      }))
      .query(async ({ input }) => {
        const { getRecentActivity } = await import('../api/analytics')
        return await getRecentActivity(input.limit)
      }),

    // Export campaign to CSV
    exportCampaignToCsv: publicProcedure
      .input(z.object({
        campaignId: z.string()
      }))
      .query(async () => {
        // CSV export - can be implemented later
        return {
          csv: 'Campaign export feature - to be implemented'
        }
      })
  }),

  // ============================================
  // UTILITIES
  // ============================================
  utils: router({
    generateSmsTemplate: publicProcedure
      .input(z.object({
        smsText: z.string().min(1)
      }))
      .query(async ({ input }) => {
        const { generateSmsTemplate } = await import('../lib/deepseek')
        return generateSmsTemplate(input.smsText)
      }),

    improveTemplateWithChat: publicProcedure
      .input(z.object({
        originalSms: z.string().min(1),
        previousTemplate: z.string().min(1),
        userFeedback: z.string().min(1),
        conversationHistory: z.array(z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string()
        })).optional()
      }))
      .mutation(async ({ input }) => {
        const { improveTemplateWithChat } = await import('../lib/deepseek')
        return improveTemplateWithChat(
          input.originalSms,
          input.previousTemplate,
          input.userFeedback,
          input.conversationHistory
        )
      })
  })
})

// Export type router for client
export type AppRouter = typeof appRouter
