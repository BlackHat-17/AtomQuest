import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGoalStatus() {
  console.log('\n=== Goal Status Diagnostic ===\n');

  // Check all goal sheets
  const sheets = await prisma.goalSheet.findMany({
    include: {
      employee: { select: { name: true, email: true } },
      cycle: { select: { year: true, phase: true, isActive: true } },
      goals: { select: { id: true, title: true, isLocked: true, isShared: true } },
    },
  });

  if (sheets.length === 0) {
    console.log('❌ No goal sheets found in database');
    console.log('💡 Run: npm run db:seed');
    return;
  }

  for (const sheet of sheets) {
    console.log(`\n📋 Goal Sheet for: ${sheet.employee.name} (${sheet.employee.email})`);
    console.log(`   Status: ${sheet.status}`);
    console.log(`   Cycle: ${sheet.cycle.year} - ${sheet.cycle.phase} ${sheet.cycle.isActive ? '(ACTIVE)' : '(INACTIVE)'}`);
    console.log(`   Goals: ${sheet.goals.length}`);
    
    if (sheet.goals.length > 0) {
      console.log('\n   Goal Details:');
      for (const goal of sheet.goals) {
        const lockStatus = goal.isLocked ? '🔒 LOCKED' : '🔓 UNLOCKED';
        const sharedStatus = goal.isShared ? '(Shared)' : '';
        console.log(`   - ${goal.title} ${lockStatus} ${sharedStatus}`);
      }
    }
  }

  // Check active cycles
  console.log('\n\n=== Active Cycles ===\n');
  const activeCycles = await prisma.goalCycle.findMany({
    where: { isActive: true },
    orderBy: { phase: 'asc' },
  });

  if (activeCycles.length === 0) {
    console.log('❌ No active cycles found');
    console.log('💡 Login as Admin and activate a cycle in Cycle Management');
  } else {
    for (const cycle of activeCycles) {
      console.log(`✅ ${cycle.year} - ${cycle.phase}`);
      console.log(`   Window: ${cycle.windowOpen?.toISOString().split('T')[0]} to ${cycle.windowClose?.toISOString().split('T')[0]}`);
    }
  }

  // Check if goals can record achievements
  console.log('\n\n=== Achievement Readiness ===\n');
  const allGoals = await prisma.goal.findMany({
    include: {
      goalSheet: {
        include: {
          employee: { select: { name: true } },
        },
      },
    },
  });

  for (const goal of allGoals) {
    const canRecordAchievements = goal.isLocked;
    const status = canRecordAchievements ? '✅ CAN record achievements' : '❌ CANNOT record achievements (not locked)';
    console.log(`${goal.goalSheet.employee.name}: ${goal.title}`);
    console.log(`   ${status}`);
  }

  console.log('\n=== Diagnostic Complete ===\n');
}

checkGoalStatus()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
