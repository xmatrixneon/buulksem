const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const locks = await prisma.lock.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });

  console.log('Query successful! Found', await prisma.lock.count(), 'total locks');
  
  const locksWithData = await Promise.all(
    locks.map(async (lock) => {
      const [country, service] = await Promise.all([
        prisma.country.findFirst({ where: { id: lock.countryid } }),
        prisma.service.findFirst({ where: { id: lock.serviceid } })
      ]);

      return {
        _id: lock.id?.toString(),
        number: lock.number,
        country: country?.name || 'Unknown',
        service: service?.name || 'Unknown',
        locked: lock.locked,
        createdAt: lock.createdAt
      };
    })
  );

  console.log('First 3 locks:');
  locksWithData.forEach(l => {
    console.log(`- ${l.number}: ${l.service} (${l.country})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
