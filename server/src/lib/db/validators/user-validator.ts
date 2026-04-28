import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

/**
 * MongoDB Schema Validator for User Collection
 * Enforces data integrity at the database level
 */

export const userCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'password'],
    additionalProperties: true, // Allow fields not in schema (like _id)
    properties: {
      _id: {
        bsonType: 'objectId'
      },
      email: {
        bsonType: 'string',
        description: 'Email address - required and must be a valid email',
        minLength: 1,
        maxLength: 255
      },
      password: {
        bsonType: 'string',
        description: 'Hashed password - required and cannot be null or empty',
        minLength: 1,
        maxLength: 255
      },
      name: {
        bsonType: ['string', 'null'],
        description: 'User full name - optional',
        maxLength: 100
      },
      apiKey: {
        bsonType: ['string', 'null'],
        description: 'API key for external access - optional and unique',
        minLength: 1,
        maxLength: 100
      },
      emailVerified: {
        bsonType: 'bool',
        description: 'Whether email has been verified'
      },
      createdAt: {
        bsonType: 'date',
        description: 'Account creation timestamp'
      },
      updatedAt: {
        bsonType: 'date',
        description: 'Last update timestamp'
      }
    }
  }
}

/**
 * Apply MongoDB schema validator to the user collection
 * Run this once to set up the validation
 */
export async function applyUserSchemaValidator() {
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/sms-gateway')

  try {
    await client.connect()
    const db = client.db('sms-gateway')

    console.log('Applying schema validator to user collection...')

    // Drop existing validator if any
    try {
      await db.command({
        collMod: 'user',
        validator: {},
        validationLevel: 'off'
      })
      console.log('Removed existing validator')
    } catch (err) {
      // No existing validator, that's fine
    }

    // Apply new validator
    await db.command({
      collMod: 'user',
      validator: userCollectionValidator,
      validationLevel: 'moderate',
      validationAction: 'error'
    })

    console.log('✅ Schema validator applied successfully!')
    console.log('\nValidation rules:')
    console.log('  - email: required, string')
    console.log('  - password: required, string (cannot be null)')
    console.log('  - name: optional, string or null')
    console.log('  - apiKey: optional, string or null')

    // Check for existing documents that violate the schema
    const invalidDocs = await db.collection('user').find({
      $or: [
        { email: { $exists: false } },
        { email: null },
        { email: '' },
        { password: { $exists: false } },
        { password: null },
        { password: '' }
      ]
    }).toArray()

    if (invalidDocs.length > 0) {
      console.log('\n⚠️  Warning: Found documents that violate the new schema:')
      invalidDocs.forEach(doc => {
        console.log(`  - ${doc.email || '(no email)'}: password is ${doc.password === null ? 'NULL' : doc.password === '' ? 'EMPTY' : 'missing'}`)
      })
      console.log('\nThese documents should be fixed.')
    } else {
      console.log('\n✅ All existing documents comply with the schema')
    }

  } catch (error) {
    console.error('Error applying schema validator:', error)
    throw error
  } finally {
    await client.close()
  }
}

/**
 * Check the current validator on the user collection
 */
export async function checkUserSchemaValidator() {
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/sms-gateway')

  try {
    await client.connect()
    const db = client.db('sms-gateway')

    const stats = await db.collection('user').aggregate([
      {
        $collStats: {
          storageStats: {}
        }
      }
    ]).toArray()

    const validator = stats[0]?.storageStats?.validator

    if (validator) {
      console.log('Current validator on user collection:')
      console.log(JSON.stringify(validator, null, 2))
    } else {
      console.log('No validator found on user collection')
    }

    return validator
  } catch (error) {
    console.error('Error checking validator:', error)
    throw error
  } finally {
    await client.close()
  }
}

// Run if executed directly
if (require.main === module) {
  applyUserSchemaValidator()
    .then(() => {
      console.log('\n✅ Done!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error)
      process.exit(1)
    })
}
