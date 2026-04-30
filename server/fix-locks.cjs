const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Use raw MongoDB command to find locks with null createdAt
  const badLocks = await prisma.$runCommandRaw({
    find: 'Lock',
    filter: { createdAt: null },
    projection: { _id: 1, number: 1 }
  });

  console.log('Found', badLocks.cursor.firstBatch.length, 'locks with null createdAt');

  if (badLocks.cursor.firstBatch.length > 0) {
    const now = new Date();
    
    for (const lock of badLocks.cursor.firstBatch) {
      await prisma.$runCommandRaw({
        update: 'Lock',
        updates: [{
          q: { _id: lock._id },
          u: { 
            $set: { 
              createdAt: now,
              updatedAt: now
            } 
          }
        }]
      });
    }
    
    console.log('Fixed all locks');
  }

  // Verify
  const stillBad = await prisma.$runCommandRaw({
    find: 'Lock',
    filter: { createdAt: null },
    limit: 1
  });
  
  console.log('Remaining bad locks:', stillBad.cursor.firstBatch.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
