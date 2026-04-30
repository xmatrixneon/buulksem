const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.orders.findFirst({
    where: { isused: true, active: true },
    orderBy: { createdAt: 'desc' }
  });

  if (order) {
    console.log('Order:');
    console.log('  Number:', order.number);
    console.log('  Country:', order.countryid);
    console.log('  Service:', order.serviceid);

    // Exact match query (like stubs API)
    const exactLock = await prisma.lock.findFirst({
      where: {
        number: order.number,
        countryid: order.countryid,
        serviceid: order.serviceid,
        locked: true
      }
    });

    console.log('\nExact Lock Match:', exactLock ? 'YES' : 'NO');
    if (exactLock) {
      console.log('  Lock ID:', exactLock.id);
      console.log('  Created:', exactLock.createdAt);
    }

    // Also check for active orders
    const activeOrder = await prisma.orders.findFirst({
      where: {
        number: order.number,
        countryid: order.countryid,
        serviceid: order.serviceid,
        active: true,
        isused: false
      }
    });

    console.log('\nActive Unused Order:', activeOrder ? 'YES (this is the problem!)' : 'NO');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
