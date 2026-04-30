const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Test the same query as the router
  const locks = await prisma.lock.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('=== RAW LOCKS ===');
  console.log('Count:', locks.length);
  locks.forEach(l => {
    console.log('ID:', l.id, 'Number:', l.number, 'CountryID:', l.countryid, 'ServiceID:', l.serviceid);
  });

  // Test populated data
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

  console.log('\n=== LOCKS WITH DATA ===');
  locksWithData.forEach(l => {
    console.log(`Number: ${l.number}, Country: ${l.country}, Service: ${l.service}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
