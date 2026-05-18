import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCycles() {
  console.log('🔍 Checking goal cycles...\n');

  try {
    const cycles = await prisma.goalCycle.findMany({
      orderBy: { phase: 'asc' },
    });

    console.log('📅 All Cycles:');
    cycles.forEach((cycle) => {
      console.log(`\n  ${cycle.phase} ${cycle.year}`);
      console.log(`    ID: ${cycle.id}`);
      console.log(`    Active: ${cycle.isActive ? '✅ YES' : '❌ NO'}`);
      console.log(`    Window: ${cycle.windowOpen.toISOString().split('T')[0]} to ${cycle.windowClose.toISOString().split('T')[0]}`);
    });

    console.log('\n');
    const activeCycles = cycles.filter((c) => c.isActive);
    console.log(`Active Cycles: ${activeCycles.length}`);
    activeCycles.forEach((c) => console.log(`  - ${c.phase} ${c.year}`));
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCycles();
