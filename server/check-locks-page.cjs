const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get sample locks
  const locks = await prisma.lock.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });

  console.log('=== SAMPLE LOCKS ===');
  console.log('Total:', await prisma.lock.count());
  locks.forEach(l => {
    console.log(`Number: ${l.number}, Country: ${l.countryid}, Service: ${l.serviceid}, Locked: ${l.locked}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
