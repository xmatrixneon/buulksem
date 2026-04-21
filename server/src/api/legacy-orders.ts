import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '../db/prisma'

/**
 * Legacy Orders API (tRPC wrapper for PHP-compatible stubs)
 *
 * This provides tRPC endpoints that wrap the legacy PHP-compatible functions
 * from stubs/orders-api.ts for use with modern clients.
 */

// Helper: Generate random cooldown between 5-20 minutes
function getRandomCooldownMinutes(): number {
  return Math.floor(Math.random() * (20 - 5 + 1)) + 5 // 5-20 random
}

// Helper: Check if number is locked for this country/service
async function isNumberLocked(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const lock = await prisma.lock.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      locked: true
    }
  })
  return !!lock
}

// Helper: Check if number has active order for this country/service
async function hasActiveOrder(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const order = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      active: true,
      isused: false
    }
  })
  return !!order
}

// Helper: Check if number was used recently (within 4 hours) for this country/service
async function hasRecentUsage(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

  const recentOrder = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      isused: true,
      createdAt: { gte: fourHoursAgo }
    }
  })
  return !!recentOrder
}

// Helper: Check if number is under cooldown (for canceled orders)
async function isUnderCooldown(number: number, countryid: string, serviceid: string): Promise<boolean> {
  const cooldownOrder = await prisma.orders.findFirst({
    where: {
      number,
      countryid,
      serviceid,
      isused: false,
      active: false // canceled or expired
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!cooldownOrder) {
    return false
  }

  const cooldownMinutes = getRandomCooldownMinutes()
  const cooldownEndTime = new Date(cooldownOrder.updatedAt.getTime() + cooldownMinutes * 60 * 1000)
  const now = new Date()

  return now < cooldownEndTime
}

/**
 * Buy Number - Smart number allocation
 *
 * PHP equivalent: action=getNumber
 *
 * Allocates a phone number for OTP service with intelligent filtering:
 * - Lock checking
 * - Active order checking
 * - Recent usage checking (4-hour window)
 * - Cooldown checking (5-20 minutes for canceled orders)
 */
export async function buyNumber({ input, ctx }: { input: any; ctx: any }) {
  const { api_key, service, country } = input

  // Validate inputs
  if (!api_key) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'BAD_KEY'
    })
  }

  if (!service) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'BAD_SERVICE'
    })
  }

  if (!country) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'BAD_COUNTRY'
    })
  }

  // Get service by code
  const servicesdata = await prisma.service.findFirst({
    where: { code: service, active: true }
  })

  if (!servicesdata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'BAD_SERVICE'
    })
  }

  // Get country by code
  const countrydata = await prisma.country.findFirst({
    where: { code: country, active: true }
  })

  if (!countrydata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'BAD_COUNTRY'
    })
  }

  // Smart number allocation with max retries
  const maxTries = 6
  let validNumber: any = null

  for (let i = 0; i < maxTries; i++) {
    // Get random available number
    const availableNumbers = await prisma.numbers.findMany({
      where: {
        active: true,
        countryid: countrydata.id,
        suspended: false
      },
      take: 20 // Get more candidates for random selection
    })

    if (availableNumbers.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'NO_NUMBER'
      })
    }

    // Pick random number from candidates
    const randomIndex = Math.floor(Math.random() * availableNumbers.length)
    const numberDoc = availableNumbers[randomIndex]!

    // Check 1: Lock checking
    const isLocked = await isNumberLocked(numberDoc.number, countrydata.id, servicesdata.id)
    if (isLocked) {
      console.log(`[BuyNumber] Number ${numberDoc.number} is locked, trying next...`)
      continue
    }

    // Check 2: Active order checking
    const hasActive = await hasActiveOrder(numberDoc.number, countrydata.id, servicesdata.id)
    if (hasActive) {
      console.log(`[BuyNumber] Number ${numberDoc.number} has active order, trying next...`)
      continue
    }

    // Check 3: Recent usage checking (4-hour window)
    const hasRecent = await hasRecentUsage(numberDoc.number, countrydata.id, servicesdata.id)
    if (hasRecent) {
      console.log(`[BuyNumber] Number ${numberDoc.number} has recent usage (4hr), trying next...`)
      continue
    }

    // Check 4: Cooldown checking (5-20 minutes for canceled orders)
    const underCooldown = await isUnderCooldown(numberDoc.number, countrydata.id, servicesdata.id)
    if (underCooldown) {
      console.log(`[BuyNumber] Number ${numberDoc.number} is under cooldown, trying next...`)
      continue
    }

    // All checks passed
    validNumber = numberDoc
    console.log(`[BuyNumber] Selected number ${validNumber.number} after ${i + 1} tries`)
    break
  }

  if (!validNumber) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'NO_NUMBER'
    })
  }

  // Create order with service templates as fallback
  const order = await prisma.orders.create({
    data: {
      number: validNumber.number,
      countryid: countrydata.id,
      serviceid: servicesdata.id,
      dialcode: countrydata.dialcode,
      active: true,
      message: [],
      format: servicesdata.format as any,
      maxmessage: servicesdata.maxmessage,
      ismultiuse: servicesdata.multisms,
      nextsms: false,
      isused: false
    }
  })

  // Format phone number for response (remove country code prefix if 12 digits)
  let number = validNumber.number.toString()
  if (number.length === 12) {
    number = number.substring(2)
  }

  return {
    success: true,
    response: `ACCESS_NUMBER:${order.id}:${countrydata.dialcode}${number}`,
    orderId: order.id,
    number: `${countrydata.dialcode}${number}`,
    rawNumber: validNumber.number,
    country: countrydata.code,
    service: servicesdata.code
  }
}

/**
 * Get SMS - OTP retrieval with timeout
 *
 * PHP equivalent: action=getStatus
 */
export async function getSms({ input, ctx }: { input: any; ctx: any }) {
  const { api_key, id } = input

  // Validate inputs
  if (!api_key) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'BAD_KEY'
    })
  }

  if (!id) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'NO_ACTIVATION'
    })
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  })

  if (!order || !order.active) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'NO_ACTIVATION'
    })
  }

  // Check 20-minute timeout
  const now = new Date()
  const orderAge = now.getTime() - order.createdAt.getTime()
  const twentyMinutes = 20 * 60 * 1000

  if (orderAge > twentyMinutes) {
    // Auto-cancel after 20 minutes
    await prisma.orders.update({
      where: { id },
      data: {
        active: false,
        failureReason: 'timeout'
      }
    })

    return {
      success: true,
      response: 'STATUS_CANCEL',
      status: 'STATUS_CANCEL',
      message: 'Order timed out after 20 minutes'
    }
  }

  // Get messages
  const messages = Array.isArray(order.message) ? order.message : []

  if (messages.length === 0) {
    const secondsLeft = Math.ceil((twentyMinutes - orderAge) / 1000)
    return {
      success: true,
      response: 'STATUS_WAIT_CODE',
      status: 'STATUS_WAIT_CODE',
      secondsLeft,
      message: 'Waiting for SMS...'
    }
  }

  // Return last message (OTP) - remove colons
  const lastMessage = messages[messages.length - 1]
  const otp = String(lastMessage).replace(/:/g, '')

  return {
    success: true,
    response: `STATUS_OK:${otp}`,
    status: 'STATUS_OK',
    otp,
    isused: order.isused,
    message: 'OTP received successfully'
  }
}

/**
 * Set Cancel/Status - Cancel or retry order
 *
 * PHP equivalent: action=setStatus
 */
export async function setCancel({ input, ctx }: { input: any; ctx: any }) {
  const { api_key, id, status } = input

  // Validate inputs
  if (!api_key) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'BAD_KEY'
    })
  }

  if (!id) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'NO_ACTIVATION'
    })
  }

  if (!status || (status !== 8 && status !== 3)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'BAD_STATUS'
    })
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  })

  if (!order || !order.active) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'NO_ACTIVATION'
    })
  }

  if (status === 8) {
    // Cancel order
    if (!order.isused) {
      // Early cancel protection: deny if < 2 minutes old
      const now = new Date()
      const orderAgeSeconds = (now.getTime() - order.createdAt.getTime()) / 1000
      const earlyCancelWindow = 2 * 60 // 2 minutes

      if (orderAgeSeconds < earlyCancelWindow) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'EARLY_CANCEL_DENIED'
        })
      }

      // Mark as cancelled
      await prisma.orders.update({
        where: { id },
        data: {
          active: false,
          failureReason: 'user_cancelled',
          qualityImpact: 0
        }
      })

      return {
        success: true,
        response: 'ACCESS_CANCEL',
        action: 'cancelled',
        message: 'Order cancelled successfully'
      }
    } else {
      // Already used - mark as completed
      await prisma.orders.update({
        where: { id },
        data: {
          active: false,
          isused: true
        }
      })

      return {
        success: true,
        response: 'ACCESS_ACTIVATION',
        action: 'activated',
        message: 'Order completed (already used)'
      }
    }
  }

  if (status === 3) {
    // Request next SMS (multi-use retry)
    if (order.isused) {
      // Already has SMS - set nextsms=true
      await prisma.orders.update({
        where: { id },
        data: {
          nextsms: true,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        response: 'ACCESS_RETRY_GET',
        action: 'retry_get',
        message: 'Ready to receive next SMS'
      }
    } else {
      // First SMS not received yet
      return {
        success: true,
        response: 'ACCESS_READY',
        action: 'ready',
        message: 'Waiting for first SMS'
      }
    }
  }

  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'BAD_STATUS'
  })
}
