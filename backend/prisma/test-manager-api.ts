import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testManagerAPI() {
  console.log('🔍 Testing Manager Team API logic...\n');

  try {
    // Get manager
    const manager = await prisma.user.findUnique({
      where: { email: 'manager@demo.com' },
    });

    if (!manager) {
      console.log('❌ Manager not found');
      return;
    }

    // Find the active GOAL_SETTING cycle first (priority for goal sheet approval)
    // If not found, fall back to any active cycle
    let activeCycle = await prisma.goalCycle.findFirst({
      where: { isActive: true, phase: 'GOAL_SETTING' },
    });

    if (!activeCycle) {
      activeCycle = await prisma.goalCycle.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    console.log('Active Cycle:', activeCycle?.phase, activeCycle?.year);
    console.log('Active Cycle ID:', activeCycle?.id);
    console.log('');

    // Fetch all direct reports
    const directReports = await prisma.user.findMany({
      where: { managerId: manager.id },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    console.log(`Direct Reports: ${directReports.length}`);
    console.log('');

    // For each direct report, find their goal sheet
    for (const employee of directReports) {
      console.log(`📋 ${employee.name} (${employee.email})`);
      
      let goalSheet = null;
      if (activeCycle) {
        goalSheet = await prisma.goalSheet.findUnique({
          where: {
            employeeId_cycleId: {
              employeeId: employee.id,
              cycleId: activeCycle.id,
            },
          },
          select: {
            id: true,
            status: true,
            submittedAt: true,
            approvedAt: true,
            reworkComment: true,
          },
        });
      }

      if (goalSheet) {
        console.log(`  ✅ Goal Sheet Found`);
        console.log(`     ID: ${goalSheet.id}`);
        console.log(`     Status: ${goalSheet.status}`);
        console.log(`     Submitted: ${goalSheet.submittedAt}`);
      } else {
        console.log(`  ❌ No goal sheet in active cycle`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testManagerAPI();
