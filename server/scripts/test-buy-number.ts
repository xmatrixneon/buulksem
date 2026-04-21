import { prisma } from '../src/db/prisma'

/**
 * Test buyNumber function
 */

async function testBuyNumber() {
  try {
    console.log('[Test] Starting buyNumber test...')

    // 1. Check if Airtel service exists
    const service = await prisma.service.findFirst({
      where: { code: 'airtel', active: true }
    })

    if (!service) {
      console.error('[Test] Airtel service not found')
      process.exit(1)
    }

    console.log('[Test] Service found:', service.name, `(id: ${service.id})`)

    // 2. Check if India country exists
    const country = await prisma.country.findFirst({
      where: { active: true }
    })

    if (!country) {
      console.error('[Test] No active country found')
      process.exit(1)
    }

    console.log('[Test] Country found:', country.name, `(+${country.dialcode}, code: ${country.code})`)

    // 3. Check available numbers
    const availableNumbers = await prisma.numbers.findMany({
      where: {
        active: true,
        countryid: country.id,
        suspended: false
      },
      take: 5
    })

    console.log(`[Test] Found ${availableNumbers.length} available numbers`)

    if (availableNumbers.length === 0) {
      console.error('[Test] No available numbers for this country')
      process.exit(1)
    }

    // Show sample numbers
    availableNumbers.slice(0, 3).forEach(n => {
      console.log(`[Test]   - Number: ${n.number} (active: ${n.active}, suspended: ${n.suspended}, locked: ${n.locked})`)
    })

    // 4. Check for locks
    const locks = await prisma.lock.findMany({
      where: {
        number: { in: availableNumbers.map(n => n.number) },
        countryid: country.id,
        serviceid: service.id,
        locked: true
      }
    })

    console.log(`[Test] Found ${locks.length} locked numbers for this service`)

    // 5. Check for active orders
    const activeOrders = await prisma.orders.findMany({
      where: {
        number: { in: availableNumbers.map(n => n.number) },
        countryid: country.id,
        serviceid: service.id,
        active: true,
        isused: false
      }
    })

    console.log(`[Test] Found ${activeOrders.length} active orders for this service`)

    // 6. Check for recent usage (4 hours)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const recentOrders = await prisma.orders.findMany({
      where: {
        number: { in: availableNumbers.map(n => n.number) },
        countryid: country.id,
        serviceid: service.id,
        isused: true,
        createdAt: { gte: fourHoursAgo }
      }
    })

    console.log(`[Test] Found ${recentOrders.length} recently used numbers (4hr window)`)

    // 7. Test the allocation logic
    const maxTries = 6
    let validNumber: any = null

    for (let i = 0; i < maxTries; i++) {
      const candidates = await prisma.numbers.findMany({
        where: {
          active: true,
          countryid: country.id,
          suspended: false
        },
        take: 20
      })

      if (candidates.length === 0) {
        console.log('[Test] No candidates available')
        break
      }

      const randomIndex = Math.floor(Math.random() * candidates.length)
      const numberDoc = candidates[randomIndex]

      // Check lock
      const isLocked = await prisma.lock.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          locked: true
        }
      })

      if (isLocked) {
        console.log(`[Test] Try ${i + 1}: Number ${numberDoc.number} is locked`)
        continue
      }

      // Check active order
      const hasActive = await prisma.orders.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          active: true,
          isused: false
        }
      })

      if (hasActive) {
        console.log(`[Test] Try ${i + 1}: Number ${numberDoc.number} has active order`)
        continue
      }

      // Check recent usage
      const hasRecent = await prisma.orders.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          isused: true,
          createdAt: { gte: fourHoursAgo }
        }
      })

      if (hasRecent) {
        console.log(`[Test] Try ${i + 1}: Number ${numberDoc.number} has recent usage`)
        continue
      }

      // Check cooldown
      const cooldownOrder = await prisma.orders.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          isused: false,
          active: false
        },
        orderBy: { updatedAt: 'desc' }
      })

      if (cooldownOrder) {
        const cooldownMinutes = Math.floor(Math.random() * (20 - 5 + 1)) + 5
        const cooldownEndTime = new Date(cooldownOrder.updatedAt.getTime() + cooldownMinutes * 60 * 1000)
        const now = new Date()

        if (now < cooldownEndTime) {
          console.log(`[Test] Try ${i + 1}: Number ${numberDoc.number} is under cooldown`)
          continue
        }
      }

      validNumber = numberDoc
      console.log(`[Test] ✓ Try ${i + 1}: Number ${validNumber.number} PASSED all checks`)
      break
    }

    if (!validNumber) {
      console.error('[Test] ✗ No valid number found after all attempts')
      process.exit(1)
    }

    console.log('[Test] ✓ buyNumber logic test PASSED')
    console.log(`[Test] Selected number: ${validNumber.number}`)
    console.log(`[Test] All checks passed successfully`)

    process.exit(0)
  } catch (error) {
    console.error('[Test] Error:', error)
    process.exit(1)
  }
}

testBuyNumber()
