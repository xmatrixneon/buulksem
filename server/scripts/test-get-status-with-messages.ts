import { prisma } from '../src/db/prisma'

/**
 * Test getStatus and check for received messages
 */

async function testGetStatusWithMessages() {
  try {
    const orderId = '69e4aeb06eb6b41fa1286ee9'
    console.log('[getStatus] Testing getsms API...\n')

    // Get order
    const order = await prisma.orders.findUnique({
      where: { id: orderId }
    })

    if (!order) {
      console.error('[getStatus] NO_ACTIVATION - Order not found')
      process.exit(1)
    }

    console.log(`[getStatus] Order: ${orderId}`)
    console.log(`  Number: ${order.number}`)
    console.log(`  Active: ${order.active}`)
    console.log(`  Is Used: ${order.isused}`)
    console.log(`  Created: ${order.createdAt.toISOString()}`)

    // Check 20-minute timeout
    const now = new Date()
    const orderAge = Math.floor((now.getTime() - order.createdAt.getTime()) / 1000)
    const twentyMinutes = 20 * 60

    console.log(`  Order age: ${orderAge} seconds\n`)

    if (!order.active) {
      console.log('[getStatus] STATUS: INACTIVE')
      console.log(`  Failure reason: ${order.failureReason}`)
      process.exit(0)
    }

    if (orderAge > twentyMinutes) {
      console.log('[getStatus] STATUS_CANCEL (timeout)')
      process.exit(0)
    }

    // Check messages in order
    const messages = Array.isArray(order.message) ? order.message : []
    console.log(`[getStatus] Messages in order: ${messages.length}`)
    if (messages.length > 0) {
      messages.forEach((m, i) => console.log(`  [${i + 1}] ${m}`))
    }
    console.log()

    if (messages.length > 0) {
      const otp = String(messages[messages.length - 1]).replace(/:/g, '')
      console.log(`[getStatus] ✓ STATUS_OK:${otp}`)
      console.log(`  OTP: ${otp}`)
      process.exit(0)
    }

    const secondsLeft = twentyMinutes - orderAge
    console.log(`[getStatus] STATUS_WAIT_CODE`)
    console.log(`  Seconds left: ${secondsLeft}`)
    console.log(`  Time remaining: ${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s\n`)

    // ============================================================
    // CHECK FOR RECEIVED MESSAGES IN DATABASE
    // ============================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[Check] Looking for received messages in database...\n')

    // Search for messages to this number
    const targetNumber = order.number.toString()
    console.log(`[Check] Target number: ${targetNumber}`)
    console.log(`[Check] Dialcode: ${order.dialcode}\n`)

    // Check different number formats
    const searchNumbers = [
      targetNumber,
      `${order.dialcode}${targetNumber}`,
      `+${order.dialcode}${targetNumber}`
    ]

    console.log(`[Check] Searching for messages to: ${searchNumbers.join(', ')}\n`)

    // Get recent messages since order creation
    const messagesReceived = await prisma.message.findMany({
      where: {
        receiver: { in: searchNumbers },
        time: { gte: order.createdAt }
      },
      orderBy: { time: 'desc' },
      take: 10
    })

    console.log(`[Check] Found ${messagesReceived.length} messages since order creation\n`)

    if (messagesReceived.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[Check] RECEIVED MESSAGES:')
      messagesReceived.forEach((msg, i) => {
        console.log(`  [${i + 1}] From: ${msg.sender}`)
        console.log(`      To: ${msg.receiver}`)
        console.log(`      Time: ${msg.time.toISOString()}`)
        console.log(`      Message: ${msg.message}`)
        console.log()
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log()
      console.log('[Check] ⚠️  Messages were received but NOT added to order!')
      console.log('[Check] This means fetch-handler may not have processed them.')
      console.log('[Check] Possible reasons:')
      console.log('  - Keywords did not match')
      console.log('  - Format did not match')
      console.log('  - Message was outside time window')
      console.log('  - Fetch worker is not running')
    } else {
      console.log('[Check] No messages received yet for this number.')
      console.log('[Check] Waiting for SMS to arrive...')
    }

    process.exit(0)
  } catch (error) {
    console.error('[Error]:', error)
    process.exit(1)
  }
}

testGetStatusWithMessages()
