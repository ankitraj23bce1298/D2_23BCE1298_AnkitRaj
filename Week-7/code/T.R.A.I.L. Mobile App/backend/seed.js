// backend/seed.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, 'geofenced.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ geofenced.json not found next to seed.js');
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data) || !data.length) {
    console.error('❌ geofenced.json must be an array of { name, path: [{lat,lng},...] }');
    process.exit(1);
  }

  console.log('🌱 Seeding geofences…');

  for (const g of data) {
    if (!g.name || !Array.isArray(g.path) || !g.path.length) continue;
    await prisma.geofence.create({
      data: {
        name: g.name,
        path: g.path,
        active: g.active !== false, // default true
      },
    });
    console.log(`  • Inserted: ${g.name} (${g.path.length} points)`);
  }

  console.log('✅ Done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
