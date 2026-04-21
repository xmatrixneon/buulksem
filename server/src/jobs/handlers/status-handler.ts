import { prisma } from '../../db/prisma'
import { sendWakeUpNotification } from '../../lib/fcm/send'
import { initializeFirebase } from '../../lib/fcm/index'

interface StatusJobResult {
  success: boolean
  processed?: number
  duration?: number
  details?: {
    devicesTotal?: number
    devicesOnline?: number
    devicesOffline?: number
    statusChangedOnline?: number
    statusChangedOffline?: number
    numbersSynced?: number
    numbersDeactivated?: number
    numberChanged?: number
    numbersBefore?: number
    numbersAfter?: number
    activeNumbersBefore?: number
    activeNumbersAfter?: number
    devicesDeleted?: number
  }
  error?: string
}

// Get India country ID
async function getIndiaId() {
  const country = await prisma.country.findFirst({ where: { name: 'India' } })
  if (!country) {
    throw new Error('India country not found in database')
  }
  return country.id
}

// Cleanup stale devices
async function cleanupStaleDevices() {
  const AUTO_DELETE_ENABLED = process.env.DEVICE_AUTO_DELETE_ENABLED !== 'false'
  const AUTO_DELETE_HOURS = parseInt(process.env.DEVICE_AUTO_DELETE_HOURS || '24')

  if (!AUTO_DELETE_ENABLED) {
    return { deleted: 0, errors: 0 }
  }

  const cutoffTime = new Date(Date.now() - AUTO_DELETE_HOURS * 60 * 60 * 1000)

  try {
    const staleDevices = await prisma.device.findMany({
      where: {
        lastHeartbeat: { lt: cutoffTime },
        isActive: true
      }
    })

    if (staleDevices.length === 0) {
      return { deleted: 0, errors: 0 }
    }

    let deletedCount = 0
    let errorCount = 0

    for (const device of staleDevices) {
      try {
        // Note: Deleting messages by metadata.deviceId requires raw MongoDB query
        // For now, skip message deletion as it's not critical for functionality
        // TODO: Implement raw MongoDB query for message cleanup

        // Deactivate all numbers from this device
        await prisma.numbers.updateMany({
          where: { port: { startsWith: `${device.deviceId}-SIM` } },
          data: { active: false, signal: 0 }
        })

        // Delete the device
        await prisma.device.delete({ where: { id: device.id } })

        deletedCount++
        console.log(`[Status] Deleted stale device ${device.deviceId}`)
      } catch (err) {
        errorCount++
        console.error(`[Status] Failed to delete device ${device.deviceId}:`, err)
      }
    }

    if (deletedCount > 0) {
      console.log(`[Status] Cleanup: Deleted ${deletedCount} stale device(s)${errorCount > 0 ? `, ${errorCount} error(s)` : ''}`)
    }

    return { deleted: deletedCount, errors: errorCount }
  } catch (err) {
    console.error(`[Status] Cleanup error:`, err)
    return { deleted: 0, errors: 1 }
  }
}

export async function handleStatusJob(data: any): Promise<StatusJobResult> {
  const startTime = Date.now()

  try {
    const offlineTimeout = new Date(Date.now() - 60 * 1000) // 60 seconds

    const activeDevices = await prisma.device.findMany({
      where: { isActive: true }
    })

    if (activeDevices.length === 0) {
      return {
        success: true,
        processed: 0,
        duration: Date.now() - startTime,
        details: { devicesTotal: 0 }
      }
    }

    const onlineDevices = activeDevices.filter(d => d.lastHeartbeat >= offlineTimeout)
    const offlineDevices = activeDevices.filter(d => d.lastHeartbeat < offlineTimeout)

    const totalNumbersBefore = await prisma.numbers.count()
    const activeNumbersBefore = await prisma.numbers.count({ where: { active: true } })

    console.log(`[Status] Starting sync: ${activeDevices.length} devices (${onlineDevices.length} online, ${offlineDevices.length} offline)`)

    const indiaId = await getIndiaId()
    const allDeviceNumberPorts = new Set<string>()
    const syncedPhoneNumbers = new Set<number>()
    let syncedCount = 0
    let deactivatedCount = 0
    let numberChangedCount = 0
    let statusChangedOnline = 0
    let statusChangedOffline = 0

    // First pass: Sync all devices and track their numbers
    for (const device of activeDevices) {
      const isOnline = device.lastHeartbeat >= offlineTimeout
      const newStatus = isOnline ? 'online' : 'offline'

      if (device.status !== newStatus) {
        await prisma.device.update({
          where: { id: device.id },
          data: { status: newStatus }
        })

        if (isOnline) {
          statusChangedOnline++
          console.log(`[Status] Device ${device.deviceId} came online`)
        } else {
          statusChangedOffline++

          // Trigger immediate wake-up for devices that just went offline
          if (device.fcmToken) {
            initializeFirebase()
            try {
              const result = await sendWakeUpNotification(device.deviceId, device.fcmToken)
              if (result.success) {
                await prisma.device.update({
                  where: { id: device.id },
                  data: { lastWakeupAttempt: new Date() }
                })
                console.log(`[Status] Wake-up sent to ${device.deviceId}`)
              } else if (result.isStaleToken) {
                // Remove stale FCM token
                await prisma.device.update({
                  where: { deviceId: device.deviceId },
                  data: { fcmToken: null, fcmTokenUpdatedAt: null }
                })
                console.log(`[Status] Stale FCM token removed for ${device.deviceId}`)
              }
            } catch (err) {
              console.warn(`[Status] Wake-up failed for ${device.deviceId}:`, err)
            }
          }
        }
      }

      // OFFLINE DEVICES: Deactivate all their numbers immediately
      if (!isOnline) {
        const result = await prisma.numbers.updateMany({
          where: {
            port: { startsWith: `${device.deviceId}-SIM` },
            active: true
          },
          data: { active: false, signal: 0 }
        })
        if (result.count > 0) {
          deactivatedCount += result.count
        }
        continue
      }

      // Process online devices
      const sims = (device.sims as any[]) || []
      for (const sim of sims) {
        if (!sim.phoneNumber || !sim.isActive) {
          continue
        }

        const port = `${device.deviceId}-SIM${sim.slot}`
        allDeviceNumberPorts.add(port)

        let phoneNumber = String(sim.phoneNumber).replace(/\D/g, '')
        const originalInput = String(sim.phoneNumber)

        // Validate and process phone number
        const isValidIndianMobile = (num: string) => /^[6-9]\d{9}$/.test(num)
        let invalidReason: string | null = null
        let finalNumber = phoneNumber

        // Case 1: Too short (< 10 digits)
        if (phoneNumber.length < 10) {
          invalidReason = `Too short (${phoneNumber.length} digits, need 10)`
        }
        // Case 2: Remove 91 country code for Indian numbers
        else if (phoneNumber.length > 10 && phoneNumber.startsWith('91')) {
          let extracted = phoneNumber.substring(2, 12)

          // If invalid, try last 10 digits as fallback
          if (!isValidIndianMobile(extracted)) {
            let fallback = phoneNumber.substring(phoneNumber.length - 10)
            if (isValidIndianMobile(fallback)) {
              extracted = fallback
            } else {
              invalidReason = `Invalid Indian format`
            }
          }

          if (!invalidReason) {
            finalNumber = extracted
          }
        }
        // Case 3: Exactly 10 digits but invalid format
        else if (phoneNumber.length === 10) {
          if (!isValidIndianMobile(phoneNumber)) {
            invalidReason = `Invalid Indian format (must start with 6-9)`
          }
        }
        // Case 4: Too long without 91 prefix
        else {
          invalidReason = `Too long (${phoneNumber.length} digits, expected 10)`
        }

        // Final validation
        if (invalidReason || !isValidIndianMobile(finalNumber)) {
          console.log(`[Status] Invalid number ${device.deviceId} SIM${sim.slot}: "${originalInput}" - ${invalidReason}`)
          continue
        }

        // Convert to number for storage
        const numberValue = parseInt(finalNumber)
        syncedPhoneNumbers.add(numberValue)

        // Deactivate ALL old numbers on this port (including inactive ones)
        // This prevents duplicates when number format changes (e.g., with/without 91 prefix)
        const oldNumbers = await prisma.numbers.findMany({
          where: {
            port,
            NOT: { number: numberValue }
          }
        })

        if (oldNumbers.length > 0) {
          await prisma.numbers.updateMany({
            where: {
              port,
              NOT: { number: numberValue }
            },
            data: { active: false, signal: 0 }
          })
          numberChangedCount += oldNumbers.length
        }

        // Upsert number
        await prisma.numbers.upsert({
          where: { number: numberValue },
          create: {
            number: numberValue,
            countryid: indiaId,
            port,
            operator: sim.carrier || null,
            signal: sim.signalStrength || 0,
            active: true,
            lastRotation: new Date(),
            locked: false
          },
          update: {
            countryid: indiaId,
            operator: sim.carrier || null,
            signal: sim.signalStrength || 0,
            active: true,
            lastRotation: new Date(),
            locked: false
          }
        })

        syncedCount++
      }
    }

    // Cleanup stale ports (only deactivate if number was NOT synced in this run)
    const staleNumbers = await prisma.numbers.findMany({
      where: {
        active: true
      }
    })

    for (const num of staleNumbers) {
      // Only deactivate if port is stale AND number wasn't synced
      const port = num.port || ''
      if (!allDeviceNumberPorts.has(port) && !syncedPhoneNumbers.has(num.number)) {
        await prisma.numbers.update({
          where: { id: num.id },
          data: { active: false, signal: 0 }
        })
        deactivatedCount++
      }
    }

    const totalNumbersAfter = await prisma.numbers.count()
    const activeNumbersAfter = await prisma.numbers.count({ where: { active: true } })
    const elapsed = Date.now() - startTime

    console.log(`[Status] Sync complete (${elapsed}ms): ${syncedCount} synced, ${deactivatedCount} deactivated, ${numberChangedCount} SIM swaps, +${statusChangedOnline} online, -${statusChangedOffline} offline`)

    // Update CronStatus for dashboard display
    try {
      await prisma.cron.upsert({
        where: { name: 'syncStatus' },
        create: { name: 'syncStatus', lastRun: new Date() },
        update: { lastRun: new Date() }
      })
    } catch (cronErr) {
      console.error('[Status] Failed to update CronStatus:', cronErr)
    }

    // Run cleanup of stale devices after sync
    const cleanupResult = await cleanupStaleDevices()

    return {
      success: true,
      processed: activeDevices.length,
      duration: elapsed,
      details: {
        devicesTotal: activeDevices.length,
        devicesOnline: onlineDevices.length,
        devicesOffline: offlineDevices.length,
        statusChangedOnline,
        statusChangedOffline,
        numbersSynced: syncedCount,
        numbersDeactivated: deactivatedCount,
        numberChanged: numberChangedCount,
        numbersBefore: totalNumbersBefore,
        numbersAfter: totalNumbersAfter,
        activeNumbersBefore,
        activeNumbersAfter,
        devicesDeleted: cleanupResult.deleted
      }
    }

  } catch (error) {
    return {
      success: false,
      processed: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    }
  }
}
