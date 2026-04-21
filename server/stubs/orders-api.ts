import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { prisma } from '../src/db/prisma'

/**
 * Orders API (Stub handlers for number allocation)
 *
 * This handles the legacy PHP API endpoints for:
 * - buynumber (getNumber): Smart number allocation with cooldown, lock checking, etc.
 * - getsms (getStatus): OTP retrieval with 20-minute timeout
 * - setcancel (setStatus): Cancel/retry with early cancel protection
 *
 * These are stub functions that can be called from Express routes or other handlers.
 */


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

  const cooldownMinutes = 1 // Fixed cooldown of 15 minutes for simplicity
  const cooldownEndTime = new Date(cooldownOrder.updatedAt.getTime() + cooldownMinutes * 60 * 1000)
  const now = new Date()

  return now < cooldownEndTime
}

/**
 * Create order with smart number allocation (buynumber equivalent)
 *
 * PHP equivalent: buynumber($request)
 * Action: getNumber
 *
 * Features:
 * - Random number selection with multiple validation checks
 * - Lock checking via Lock model
 * - Active order checking
 * - Recent usage checking (4-hour window)
 * - Cooldown checking (5-20 minutes for canceled orders)
 * - Service template fallback (keywords, format, maxmessage)
 *
 * @param input - { api_key, service, country }
 * @returns Response string in format: "ACCESS_NUMBER:orderId:91number"
 */
export async function buynumber(params: {
  api_key: string
  service: string
  country: string
}): Promise<string> {
  const { api_key, service, country } = params

  // Validate API key (skip for now - add auth later)
  if (!api_key) {
    return "BAD_KEY"
  }

  // Validate service
  if (!service) {
    return "BAD_SERVICE"
  }

  // Validate country
  if (!country) {
    return "BAD_COUNTRY"
  }

  // Get service by code
  const servicesdata = await prisma.service.findFirst({
    where: { code: service, active: true }
  })

  if (!servicesdata) {
    return "BAD_SERVICE"
  }

  // Get country by code
  const countrydata = await prisma.country.findFirst({
    where: { code: country, active: true }
  })

  if (!countrydata) {
    return "BAD_COUNTRY"
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
      return "NO_NUMBER"
    }

    // Pick random number from candidates
    const randomIndex = Math.floor(Math.random() * availableNumbers.length)
    const numberDoc = availableNumbers[randomIndex]

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
    return "NO_NUMBER"
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

  // Return in PHP format: "ACCESS_NUMBER:orderId:91number"
  return `ACCESS_NUMBER:${order.id}:${countrydata.dialcode}${number}`
}

/**
 * Get order status with OTP retrieval (getsms equivalent)
 *
 * PHP equivalent: getsms($request)
 * Action: getStatus
 *
 * Features:
 * - 20-minute timeout
 * - Returns last message (OTP)
 * - STATUS_WAIT_CODE if no OTP yet
 * - STATUS_CANCEL after 20 minutes
 *
 * @param input - { api_key, id }
 * @returns Response string: "STATUS_OK:otp" or "STATUS_WAIT_CODE" or "STATUS_CANCEL"
 */
export async function getsms(params: {
  api_key: string
  id: string
}): Promise<string> {
  const { api_key, id } = params

  // Validate API key
  if (!api_key) {
    return "BAD_KEY"
  }

  // Validate order ID
  if (!id) {
    return "NO_ACTIVATION"
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  })

  if (!order || !order.active) {
    return "NO_ACTIVATION"
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

    return "STATUS_CANCEL"
  }

  // Get messages
  const messages = Array.isArray(order.message) ? order.message : []

  if (messages.length === 0) {
    return "STATUS_WAIT_CODE"
  }

  // Return last message (OTP) - remove colons
  const lastMessage = messages[messages.length - 1]
  const otp = String(lastMessage).replace(/:/g, '')

  return `STATUS_OK:${otp}`
}

/**
 * Cancel or set order for retry (setcancel equivalent)
 *
 * PHP equivalent: setcancel($request)
 * Action: setStatus
 *
 * Features:
 * - Early cancel protection (2-minute window) - returns "EARLY_CANCEL_DENIED"
 * - Status 8 (cancel): marks order as inactive
 * - Status 3 (next): sets nextsms=true for multi-use orders
 *
 * @param input - { api_key, id, status }
 * @returns Response string: "ACCESS_CANCEL", "ACCESS_ACTIVATION", "ACCESS_RETRY_GET", "ACCESS_READY", or error codes
 */
export async function setcancel(params: {
  api_key: string
  id: string
  status: number // 8 = cancel, 3 = next/retry
}): Promise<string> {
  const { api_key, id, status } = params

  // Validate API key
  if (!api_key) {
    return "BAD_KEY"
  }

  // Validate order ID
  if (!id) {
    return "NO_ACTIVATION"
  }

  // Validate status
  if (!status || (status !== 8 && status !== 3)) {
    return "BAD_STATUS"
  }

  // Get order
  const order = await prisma.orders.findUnique({
    where: { id }
  })

  if (!order || !order.active) {
    return "NO_ACTIVATION"
  }

  if (status === 8) {
    // Cancel order
    if (!order.isused) {
      // Early cancel protection: deny if < 2 minutes old
      const now = new Date()
      const orderAgeSeconds = (now.getTime() - order.createdAt.getTime()) / 1000
      const earlyCancelWindow = 2 * 60 // 2 minutes

      if (orderAgeSeconds < earlyCancelWindow) {
        return "EARLY_CANCEL_DENIED"
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

      return "ACCESS_CANCEL"
    } else {
      // Already used - mark as completed
      await prisma.orders.update({
        where: { id },
        data: {
          active: false,
          isused: true
        }
      })

      return "ACCESS_ACTIVATION"
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

      return "ACCESS_RETRY_GET"
    } else {
      // First SMS not received yet
      return "ACCESS_READY"
    }
  }

  return "BAD_STATUS"
}

/**
 * Express handler stub for the orders API
 * This can be used to create Express routes that match the PHP API
 */
export async function ordersApiHandler(req: {
  query: {
    action?: string
    api_key?: string
    service?: string
    country?: string
    id?: string
    status?: string
  }
}): Promise<string> {
  const { action } = req.query

  if (action === 'getNumber') {
    return buynumber({
      api_key: req.query.api_key || '',
      service: req.query.service || '',
      country: req.query.country || ''
    })
  }

  if (action === 'getStatus') {
    return getsms({
      api_key: req.query.api_key || '',
      id: req.query.id || ''
    })
  }

  if (action === 'setStatus') {
    return setcancel({
      api_key: req.query.api_key || '',
      id: req.query.id || '',
      status: parseInt(req.query.status || '0')
    })
  }

  return "WRONG_ACTION"
}
