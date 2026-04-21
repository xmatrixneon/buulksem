import { prisma } from '../src/db/prisma'

/**
 * Check number availability status
 */

async function checkNumberStatus() {
  try {
    console.log('[Check] Analyzing number availability...\n')

    // Get service
    const service = await prisma.service.findFirst({
      where: { code: 'airtel', active: true }
    })

    if (!service) {
      console.error('[Check] Airtel service not found')
      process.exit(1)
    }

    // Get country
    const country = await prisma.country.findFirst({
      where: { active: true }
    })

    if (!country) {
      console.error('[Check] No active country found')
      process.exit(1)
    }

    // Get all numbers for this country
    const allNumbers = await prisma.numbers.findMany({
      where: {
        active: true,
        countryid: country.id,
        suspended: false
      }
    })

    console.log(`[Check] Total available numbers: ${allNumbers.length}\n`)

    for (const num of allNumbers) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`[Check] Number: ${num.number}`)
      console.log(`  Active: ${num.active}`)
      console.log(`  Suspended: ${num.suspended}`)
      console.log(`  Locked: ${num.locked}`)
      console.log(`  Quality Score: ${num.qualityScore}\n`)

      // Check 1: Lock
      const isLocked = await prisma.lock.findFirst({
        where: {
          number: num.number,
          countryid: country.id,
          serviceid: service.id,
          locked: true
        }
      })
      console.log(`  [1] Lock check: ${isLocked ? 'LOCKED ✗' : 'Free ✓'}`)

      // Check 2: Active order
      const hasActive = await prisma.orders.findFirst({
        where: {
          number: num.number,
          countryid: country.id,
          serviceid: service.id,
          active: true,
          isused: false
        }
      })
      console.log(`  [2] Active order: ${hasActive ? 'HAS ACTIVE ORDER ✗' : 'None ✓'}`)

      // Check 3: Recent usage (4 hours)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
      const hasRecent = await prisma.orders.findFirst({
        where: {
          number: num.number,
          countryid: country.id,
          serviceid: service.id,
          isused: true,
          createdAt: { gte: fourHoursAgo }
        }
      })
      console.log(`  [3] Recent usage (4hr): ${hasRecent ? 'USED RECENTLY ✗' : 'Clean ✓'}`)

      // Check 4: Cooldown
      const cooldownOrder = await prisma.orders.findFirst({
        where: {
          number: num.number,
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
        const underCooldown = now < cooldownEndTime

        if (underCooldown) {
          const remainingSeconds = Math.ceil((cooldownEndTime.getTime() - now.getTime()) / 1000)
          console.log(`  [4] Cooldown: UNDER COOLDOWN ✗ (${remainingSeconds}s remaining)`)
        } else {
          console.log(`  [4] Cooldown: Ready ✓`)
        }
      } else {
        console.log(`  [4] Cooldown: No previous orders ✓`)
      }

      // Overall status
      const blocked = isLocked || hasActive || hasRecent
      console.log(`\n  Status: ${blocked ? 'BLOCKED' : 'AVAILABLE ✓'}`)
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    process.exit(0)
  } catch (error) {
    console.error('[Check] Error:', error)
    process.exit(1)
  }
}

checkNumberStatus()
