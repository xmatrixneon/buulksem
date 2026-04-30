const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Exact same query as router
  const locks = await prisma.lock.findMany({
    orderBy: { createdAt: 'desc' }
  });

  console.log('Total locks:', locks.length);

  // Same population logic as router
  const locksWithData = await Promise.all(
    locks.map(async (lock) => {
      const [country, service] = await Promise.all([
        prisma.country.findFirst({ where: { id: lock.countryid } }),
        prisma.service.findFirst({ where: { id: lock.serviceid } })
      ]);

      return {
        _id: lock.id?.toString(),
        id: lock.id?.toString(),
        number: lock.number,
        country: country?.name || 'Unknown',
        service: service?.name || 'Unknown',
        serviceid: lock.serviceid,
        countryid: lock.countryid,
        locked: lock.locked,
        createdAt: lock.createdAt,
        updatedAt: lock.updatedAt
      };
    })
  );

  console.log('Populated locks:', locksWithData.length);
  console.log('First lock:', JSON.stringify(locksWithData[0], null, 2));
  
  // Check for any undefined/null values that might break the UI
  locksWithData.forEach(l => {
    if (!l._id || !l.number || !l.country || !l.service) {
      console.log('Invalid lock:', l);
    }
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
