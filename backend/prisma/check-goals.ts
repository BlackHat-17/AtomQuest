import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGoals() {
  console.log('🔍 Checking employee goals...\n');

  try {
    // Get employee
    const employee = await prisma.user.findUnique({
      where: { email: 'employee@demo.com' },
    });

    if (!employee) {
      console.log('❌ Employee not found');
      return;
    }

    // Get goal sheet
    const sheet = await prisma.goalSheet.findFirst({
      where: { employeeId: employee.id },
      include: {
        goals: {
          orderBy: { createdAt: 'asc' },
        },
        cycle: true,
      },
    });

    if (!sheet) {
      console.log('❌ No goal sheet found');
      return;
    }

    console.log('📋 Goal Sheet Details:');
    console.log('  ID:', sheet.id);
    console.log('  Status:', sheet.status);
    console.log('  Cycle:', sheet.cycle.phase, sheet.cycle.year);
    console.log('  Submitted At:', sheet.submittedAt);
    console.log('  Goals Count:', sheet.goals.length);
    console.log('');

    if (sheet.goals.length === 0) {
      console.log('⚠️  No goals found in the sheet!');
      return;
    }

    console.log('🎯 Goals:');
    sheet.goals.forEach((goal, index) => {
      console.log(`\n  ${index + 1}. ${goal.title}`);
      console.log(`     Thrust Area: ${goal.thrustArea}`);
      console.log(`     Target: ${goal.target}`);
      console.log(`     Weightage: ${goal.weightage}%`);
      console.log(`     UoM Type: ${goal.uomType}`);
      console.log(`     Locked: ${goal.isLocked}`);
      console.log(`     Shared: ${goal.isShared}`);
    });

    console.log('\n✅ Goals are present in the database');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGoals();
