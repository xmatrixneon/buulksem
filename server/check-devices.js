import { prisma } from './src/db/prisma.js';

const devices = await prisma.device.findMany({
  where: { isActive: true },
  orderBy: { lastHeartbeat: 'desc' },
  take: 10
});

console.log('Recent Devices:');
console.log('────────────────────────────────────────────────────────────');
for (const d of devices) {
  const hoursSince = Math.floor((Date.now() - d.lastHeartbeat.getTime()) / (1000 * 60 * 60));
  console.log(`${d.deviceId.slice(0,12)}... | Status: ${d.status.padEnd(7)} | Last seen: ${hoursSince}h ago | Name: ${d.name}`);
}
process.exit(0);
