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
    console.log('Number:', order.number);
    console.log('Type:', typeof order.number);

    // Raw query for lock
    const lockRaw = await prisma.$runCommandRaw({
      find: 'Lock',
      filter: {
        number: order.number,
        countryid: { $oid: order.countryid },
        serviceid: { $oid: order.serviceid }
      }
    });

    console.log('Locks (raw):', lockRaw.cursor.firstBatch.length);
  }

  console.log('Total Locks:', await prisma.lock.count());
}

main().catch(console.error).finally(() => prisma.$disconnect());
