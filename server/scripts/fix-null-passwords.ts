import { PrismaClient } from '../src/db/prisma'
import { randomBytes } from 'crypto'

// Generate a random secure password
function generateRandomPassword(): string {
  return randomBytes(16).toString('base64').slice(0, 24)
}

// Hash password (using bcrypt pattern - in production, use bcrypt)
// For now, we'll set a placeholder that users must change
async function main() {
  const prisma = new PrismaClient()

  try {
    // Find users with null or empty passwords
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { password: null },
          { password: '' }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    })

    console.log(`Found ${users.length} users with null/empty passwords:`)

    if (users.length === 0) {
      console.log('No users to fix. Exiting.')
      await prisma.$disconnect()
      return
    }

    for (const user of users) {
      const tempPassword = generateRandomPassword()

      await prisma.user.update({
        where: { id: user.id },
        data: { password: tempPassword }
      })

      console.log(`✓ Fixed user: ${user.email} | Name: ${user.name || 'N/A'}`)
      console.log(`  Temporary password: ${tempPassword}`)
      console.log(`  IMPORTANT: User should change password on next login\n`)
    }

    console.log(`\n✅ Successfully fixed ${users.length} users`)
    console.log('\nNext steps:')
    console.log('1. Notify users to log in and change their passwords')
    console.log('2. Or implement a "reset password" flow')

  } catch (error) {
    console.error('Error fixing passwords:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
