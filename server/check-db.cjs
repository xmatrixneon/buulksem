const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get an order that has isused=true
  const usedOrder = await prisma.orders.findFirst({
    where: { 
      isused: true,
      active: true 
    }
  });

  if (usedOrder) {
    console.log('=== SAMPLE ORDER (isused=true, active=true) ===');
    console.log('Order ID:', usedOrder.id);
    console.log('Number:', usedOrder.number);
    console.log('Service:', usedOrder.serviceid);
    console.log('Country:', usedOrder.countryid);
    console.log('isused:', usedOrder.isused);
    console.log('active:', usedOrder.active);
    console.log('messages:', usedOrder.message);

    // Check if lock exists for this number+service+country
    const existingLock = await prisma.$runCommandRaw({
      find: 'lock',
      filter: {
        number: usedOrder.number,
        serviceid: usedOrder.serviceid,
        countryid: usedOrder.countryid
      }
    });

    console.log('\n=== LOCK FOR THIS ORDER ===');
    console.log('Lock exists:', existingLock.cursor.firstBatch.length > 0);
    if (existingLock.cursor.firstBatch.length > 0) {
      console.log('Lock data:', existingLock.cursor.firstBatch[0]);
    }
  }

  // Check all orders to understand the pattern
  const allUsedOrders = await prisma.orders.findMany({
    where: { isused: true }
  });

  console.log('\n=== ALL ORDERS WITH isused=true ===');
  console.log('Total:', allUsedOrders.length);
  console.log('Still active:', allUsedOrders.filter(o => o.active).length);
  console.log('Inactive (completed):', allUsedOrders.filter(o => !o.active).length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
