const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.orders.findFirst({
    where: { isused: true, active: true },
    orderBy: { createdAt: 'desc' }
  });

  if (order) {
    console.log('Order Number:', order.number, 'Type:', typeof order.number);
    
    const lockRaw = await prisma.$runCommandRaw({
      find: 'Lock',
      filter: {
        number: order.number,
        countryid: { $oid: order.countryid },
        serviceid: { $oid: order.serviceid }
      }
    });
    
    console.log('Locks found (raw):', lockRaw.cursor.firstBatch.length);
  }
  
  console.log('Total Locks:', await prisma.lock.count());
}

main().catch(console.error).finally(() => prisma.$disconnect());
