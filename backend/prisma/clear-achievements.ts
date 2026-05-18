import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAchievements() {
  console.log('🗑️  Clearing all achievement data...');

  try {
    // Delete all achievements
    const deletedAchievements = await prisma.achievement.deleteMany({});
    console.log(`✅ Deleted ${deletedAchievements.count} achievements`);

    // Delete all check-ins
    const deletedCheckIns = await prisma.checkIn.deleteMany({});
    console.log(`✅ Deleted ${deletedCheckIns.count} check-ins`);

    // Delete all audit logs
    const deletedAuditLogs = await prisma.auditLog.deleteMany({});
    console.log(`✅ Deleted ${deletedAuditLogs.count} audit logs`);

    // Delete all shared goals
    const deletedSharedGoals = await prisma.sharedGoal.deleteMany({});
    console.log(`✅ Deleted ${deletedSharedGoals.count} shared goals`);

    // Delete all goals
    const deletedGoals = await prisma.goal.deleteMany({});
    console.log(`✅ Deleted ${deletedGoals.count} goals`);

    // Delete all goal sheets
    const deletedSheets = await prisma.goalSheet.deleteMany({});
    console.log(`✅ Deleted ${deletedSheets.count} goal sheets`);

    // Delete all escalation logs
    const deletedEscalationLogs = await prisma.escalationLog.deleteMany({});
    console.log(`✅ Deleted ${deletedEscalationLogs.count} escalation logs`);

    // Delete all escalation rules
    const deletedEscalationRules = await prisma.escalationRule.deleteMany({});
    console.log(`✅ Deleted ${deletedEscalationRules.count} escalation rules`);

    // Delete all goal cycles
    const deletedCycles = await prisma.goalCycle.deleteMany({});
    console.log(`✅ Deleted ${deletedCycles.count} goal cycles`);

    console.log('');
    console.log('🎉 All data cleared successfully!');
    console.log('');
    console.log('Note: Users were preserved.');
    console.log('Admin can now create fresh goal cycles via Cycle Management page.');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearAchievements();
