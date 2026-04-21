import { prisma } from '../src/db/prisma'

/**
 * Create Airtel Service
 *
 * Format: "{otp} is your OTP to login into Airtel Thanks app. Valid for {time} secs. Do not share with anyone. If this was not you click {random}"
 */

async function createAirtelService() {
  try {
    // Check if service already exists
    const existing = await prisma.service.findFirst({
      where: { code: 'airtel' }
    })

    if (existing) {
      console.log('[Airtel] Service already exists, updating...')
      await prisma.service.update({
        where: { id: existing.id },
        data: {
          name: 'Airtel',
          code: 'airtel',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Bharti_Airtel_Logo.svg/200px-Bharti_Airtel_Logo.svg.png',
          active: true,
          multisms: true,
          maxmessage: 10,
          keywords: [
            'airtel',
            'thanks',
            'otp',
            'login'
          ],
          format: [
            '{otp} is your OTP to login into Airtel Thanks app. Valid for {time} secs. Do not share with anyone. If this was not you click {random}'
          ]
        }
      })
      console.log('[Airtel] Service updated successfully')
    } else {
      // Create new service
      const service = await prisma.service.create({
        data: {
          name: 'Airtel',
          code: 'airtel',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Bharti_Airtel_Logo.svg/200px-Bharti_Airtel_Logo.svg.png',
          active: true,
          multisms: true,
          maxmessage: 10,
          keywords: [
            'airtel',
            'thanks',
            'otp',
            'login'
          ],
          format: [
            '{otp} is your OTP to login into Airtel Thanks app. Valid for {time} secs. Do not share with anyone. If this was not you click {random}'
          ]
        }
      })
      console.log('[Airtel] Service created successfully:', service.code)
    }

    console.log('[Airtel] Format template saved')
    console.log('[Airtel] Keywords:', ['airtel', 'thanks', 'otp', 'login'])

    process.exit(0)
  } catch (error) {
    console.error('[Airtel] Error:', error)
    process.exit(1)
  }
}

createAirtelService()
