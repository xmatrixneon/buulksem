import { prisma } from '../src/db/prisma'

/**
 * Test getNumber (buyNumber) API - Create actual order
 */

async function testGetNumber() {
  try {
    console.log('[getNumber] Testing buyNumber API...\n')

    // Get service
    const service = await prisma.service.findFirst({
      where: { code: 'airtel', active: true }
    })

    if (!service) {
      console.error('[getNumber] Airtel service not found')
      process.exit(1)
    }

    // Get country
    const country = await prisma.country.findFirst({
      where: { active: true }
    })

    if (!country) {
      console.error('[getNumber] No active country found')
      process.exit(1)
    }

    console.log('[getNumber] Input parameters:')
    console.log(`  api_key: test-key-123`)
    console.log(`  service: ${service.code} (${service.name})`)
    console.log(`  country: ${country.code} (${country.name})`)
    console.log(`  dialcode: +${country.dialcode}\n`)

    // Smart number allocation with max retries
    const maxTries = 6
    let validNumber: any = null
    let attempts = 0

    for (let i = 0; i < maxTries; i++) {
      attempts++

      const candidates = await prisma.numbers.findMany({
        where: {
          active: true,
          countryid: country.id,
          suspended: false
        },
        take: 20
      })

      if (candidates.length === 0) {
        console.log('[getNumber] No candidates available')
        break
      }

      const randomIndex = Math.floor(Math.random() * candidates.length)
      const numberDoc = candidates[randomIndex]

      // Check 1: Lock
      const isLocked = await prisma.lock.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          locked: true
        }
      })

      if (isLocked) continue

      // Check 2: Active order
      const hasActive = await prisma.orders.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          active: true,
          isused: false
        }
      })

      if (hasActive) continue

      // Check 3: Recent usage (4 hours)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

      const hasRecent = await prisma.orders.findFirst({
        where: {
          number: numberDoc.number,
          countryid: country.id,
          serviceid: service.id,
          isused: true,
          createdAt: { gte: fourHoursAgo }
        }
      })

      if (hasRecent) continue

      // Check 4: Cooldown
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
        const cooldownMinutes =
          Math.floor(Math.random() * (20 - 5 + 1)) + 5

        const cooldownEndTime = new Date(
          cooldownOrder.updatedAt.getTime() +
            cooldownMinutes * 60 * 1000
        )

        const now = new Date()

        if (now < cooldownEndTime) continue
      }

      validNumber = numberDoc
      break
    }

    if (!validNumber) {
      console.error('[getNumber] NO_NUMBER - No valid number found')
      process.exit(1)
    }

    console.log(
      `[getNumber] Number selected after ${attempts} attempt(s): ${validNumber.number}\n`
    )

    // Create order
    const order = await prisma.orders.create({
      data: {
        number: validNumber.number,
        countryid: country.id,
        serviceid: service.id,
        dialcode: country.dialcode,
        active: true,
        message: [],
        format: service.format as any,
        maxmessage: service.maxmessage,
        ismultiuse: service.multisms,
        nextsms: false,
        isused: false
      }
    })

    // Format phone number for response
    let number = validNumber.number.toString()

    if (number.length === 12) {
      number = number.substring(2)
    }

    // PHP format response
    const response = `ACCESS_NUMBER:${order.id}:${country.dialcode}${number}`

    console.log('[getNumber] ✓ Order created successfully!\n')
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    console.log('[getNumber] PHP FORMAT RESPONSE:')
    console.log(`  ${response}`)
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    console.log()

    console.log('[getNumber] PARSED VALUES:')
    console.log(`  Order ID: ${order.id}`)
    console.log(`  Phone: ${country.dialcode}${number}`)
    console.log(`  Raw Number: ${validNumber.number}`)
    console.log(`  Service: ${service.code} (${service.name})`)
    console.log(`  Country: ${country.code} (${country.name})`)
    console.log(`  Active: ${order.active}`)
    console.log()

    console.log('[getNumber] SERVICE TEMPLATES:')
    console.log(`  Format: ${JSON.stringify(service.format)}`)
    console.log(`  Max Messages: ${service.maxmessage}`)
    console.log(`  Multi-use: ${service.multisms}`)
    console.log(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    console.log()

    process.exit(0)
  } catch (error) {
    console.error('[getNumber] Error:', error)
    process.exit(1)
  }
}

testGetNumber()