const { MongoClient } = require('mongodb')
const { randomBytes } = require('crypto')
require('dotenv').config()

// Generate a random secure password
function generateRandomPassword() {
  return randomBytes(16).toString('base64').slice(0, 24)
}

async function main() {
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/sms-gateway')

  try {
    await client.connect()
    const db = client.db('sms-gateway')
    const users = db.collection('user')

    // Find users with null or empty passwords
    const usersWithNullPasswords = await users.find({
      $or: [
        { password: null },
        { password: '' }
      ]
    }).toArray()

    console.log(`Found ${usersWithNullPasswords.length} users with null/empty passwords:`)

    if (usersWithNullPasswords.length === 0) {
      console.log('No users to fix. Exiting.')
      return
    }

    for (const user of usersWithNullPasswords) {
      const tempPassword = generateRandomPassword()

      await users.updateOne(
        { _id: user._id },
        { $set: { password: tempPassword } }
      )

      console.log(`✓ Fixed user: ${user.email} | Name: ${user.name || 'N/A'}`)
      console.log(`  Temporary password: ${tempPassword}`)
      console.log(`  IMPORTANT: User should change password on next login\n`)
    }

    console.log(`\n✅ Successfully fixed ${usersWithNullPasswords.length} users`)
    console.log('\nNext steps:')
    console.log('1. Notify users to log in and change their passwords')
    console.log('2. Or implement a "reset password" flow')

  } catch (error) {
    console.error('Error fixing passwords:', error)
  } finally {
    await client.close()
  }
}

main()
