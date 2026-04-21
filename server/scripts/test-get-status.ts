import { prisma } from '../src/db/prisma'

/**
 * Test getStatus (getsms) API
 */

async function testGetStatus() {
  try {
    const orderId = '69e749a52368bb86692c7437'
    console.log('[getStatus] Testing getsms API...\n')
    console.log(`[getStatus] Input parameters:`)
    console.log(`  api_key: test-key-123`)
    console.log(`  id: ${orderId}\n`)

    // Get order
    const order = await prisma.orders.findUnique({
      where: { id: orderId }
    })

    if (!order || !order.active) {
      console.error('[getStatus] NO_ACTIVATION')
      process.exit(1)
    }

    console.log(`[getStatus] Order found:`)
    console.log(`  Number: ${order.number}`)
    console.log(`  Active: ${order.active}`)
    console.log(`  Is Used: ${order.isused}`)
    console.log(`  Created: ${order.createdAt.toISOString()}`)
    console.log(`  Messages: ${JSON.stringify(order.message)}\n`)

    // Check 20-minute timeout
    const now = new Date()
    const orderAge = now.getTime() - order.createdAt.getTime()
    const twentyMinutes = 20 * 60 * 1000

    console.log(`[getStatus] Timeout check:`)
    console.log(`  Order age: ${Math.floor(orderAge / 1000)} seconds`)
    console.log(`  Timeout limit: 1200 seconds (20 minutes)`)

    if (orderAge > twentyMinutes) {
      // Auto-cancel after 20 minutes
      await prisma.orders.update({
        where: { id: orderId },
        data: {
          active: false,
          failureReason: 'timeout'
        }
      })

      console.log('\n[getStatus] STATUS_CANCEL (Order timed out)')
      process.exit(0)
    }

    // Get messages
    const messages = Array.isArray(order.message) ? order.message : []

    console.log(`  Messages received: ${messages.length}\n`)

    if (messages.length === 0) {
      const secondsLeft = Math.ceil((twentyMinutes - orderAge) / 1000)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[getStatus] PHP FORMAT RESPONSE:')
      console.log(`  STATUS_WAIT_CODE`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log()
      console.log('[getStatus] DETAILS:')
      console.log(`  Status: Waiting for SMS...`)
      console.log(`  Seconds left: ${secondsLeft}`)
      console.log(`  Time remaining: ${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log()
      process.exit(0)
    }

    // Return last message (OTP) - remove colons
    const lastMessage = messages[messages.length - 1]
    const otp = String(lastMessage).replace(/:/g, '')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[getStatus] PHP FORMAT RESPONSE:')
    console.log(`  STATUS_OK:${otp}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log()
    console.log('[getStatus] DETAILS:')
    console.log(`  Status: OTP received`)
    console.log(`  OTP: ${otp}`)
    console.log(`  Is Used: ${order.isused}`)
    console.log(`  Total messages: ${messages.length}`)
    console.log(`  Last message: ${lastMessage}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log()

    process.exit(0)
  } catch (error) {
    console.error('[getStatus] Error:', error)
    process.exit(1)
  }
}

testGetStatus()
