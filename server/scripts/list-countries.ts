import { prisma } from '../src/db/prisma'

;(async () => {
  const countries = await prisma.country.findMany()
  console.log(`Found ${countries.length} countries:`)
  countries.forEach(c => console.log(`  ${c.code} - ${c.name} (+${c.dialcode})`))
  process.exit(0)
})()
