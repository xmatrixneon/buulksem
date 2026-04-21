import { prisma } from '../src/db/prisma'

/**
 * Update Airtel Service Format
 *
 * New format: {otp} is your OTP to login into Airtel app. Valid for {time}. Do not share with anyone. If this was not you click {any} {random}
 */

async function updateAirtelFormat() {
  try {
    const service = await prisma.service.findFirst({
      where: { code: 'airtel' }
    })

    if (!service) {
      console.error('[Airtel] Service not found')
      process.exit(1)
    }

    console.log('[Airtel] Updating format...\n')
    console.log('[Airtel] OLD format:', JSON.stringify(service.format))

    // Update with new format (add as additional format option)
    const newFormats = [
      '{otp} is your OTP to login into Airtel app. Valid for {time}. Do not share with anyone. If this was not you click {any} {random}',
      // Keep existing format as backup
      '{otp} is your OTP to login into Airtel Thanks app. Valid for {time} secs. Do not share with anyone. If this was not you click {random}'
    ]

    await prisma.service.update({
      where: { id: service.id },
      data: {
        format: newFormats as any
      }
    })

    console.log('\n[Airtel] NEW formats:')
    newFormats.forEach((f, i) => console.log(`  [${i + 1}] ${f}`))
    console.log('\n[Airtel] Format updated successfully!')

    process.exit(0)
  } catch (error) {
    console.error('[Airtel] Error:', error)
    process.exit(1)
  }
}

updateAirtelFormat()
