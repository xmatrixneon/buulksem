const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get an order with isused=true, active=true
  const order = await prisma.orders.findFirst({
    where: { 
      isused: true,
      active: true 
    },
    orderBy: { createdAt: 'desc' }
  });

  if (order) {
    console.log('=== ORDER ===');
    console.log('ID:', order.id);
    console.log('Number:', order.number);
    console.log('Number type:', typeof order.number);
    console.log('Country:', order.countryid);
    console.log('Service:', order.serviceid);

    // Check for lock using raw query
    const lockRaw = await prisma.$runCommandRaw({
      find: 'Lock',
      filter: {
        number: order.number,
        countryid: { $oid: order.countryid },
        serviceid: { $oid: order.serviceid }
      }
    });

    console.log('\n=== LOCK (raw query) ===');
    console.log('Found:', lockRaw.cursor.firstBatch.length);
    if (lockRaw.cursor.firstBatch.length > 0) {
      lockRaw.cursor.firstBatch.forEach(l => {
        console.log('Lock:', l._id, 'Number:', l.number, 'Locked:', l.locked);
      });
    }

    // Try Prisma query
    const lockPrisma = await prisma.lock.findFirst({
      where: {
        number: order.number,
        countryid: order.countryid,
        serviceid: order.serviceid
      }
    });

    console.log('\n=== LOCK (Prisma) ===');
    console.log('Found:', lockPrisma ? 'YES' : 'NO');
    if (lockPrisma) {
      console.log('Lock:', lockPrisma);
    }
  }

  // Count all locks
  const lockCount = await prisma.lock.count();
  console.log('\n=== TOTAL LOCKS ===');
  console.log('Count:', lockCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
