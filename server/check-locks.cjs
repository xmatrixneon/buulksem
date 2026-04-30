const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.orders.findFirst({
    where: { isused: true, active: true },
    orderBy: { createdAt: 'desc' }
  });

  if (order) {
    console.log('=== ORDER DETAILS ===');
    console.log('Number:', order.number);
    console.log('Country:', order.countryid);
    console.log('Service:', order.serviceid);

    // Find all locks for this number
    const allLocks = await prisma.$runCommandRaw({
      find: 'Lock',
      filter: { number: order.number }
    });

    console.log('\n=== ALL LOCKS FOR THIS NUMBER ===');
    console.log('Count:', allLocks.cursor.firstBatch.length);
    allLocks.cursor.firstBatch.forEach(l => {
      console.log(`Service: ${l.serviceid}, Country: ${l.countryid}, Locked: ${l.locked}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
