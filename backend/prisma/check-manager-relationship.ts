import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkManagerRelationship() {
  console.log('🔍 Checking manager-employee relationships...\n');

  try {
    // Get employee user
    const employee = await prisma.user.findUnique({
      where: { email: 'employee@demo.com' },
      select: {
        id: true,
        name: true,
        email: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!employee) {
      console.log('❌ Employee user not found');
      return;
    }

    console.log('Employee:', employee.name);
    console.log('Email:', employee.email);
    console.log('Manager ID:', employee.managerId);
    console.log('Manager:', employee.manager ? employee.manager.name : 'NOT ASSIGNED');
    console.log('');

    // Get employee's goal sheet
    const goalSheet = await prisma.goalSheet.findFirst({
      where: { employeeId: employee.id },
      include: {
        goals: true,
        cycle: true,
      },
    });

    if (!goalSheet) {
      console.log('❌ No goal sheet found for employee');
      return;
    }

    console.log('Goal Sheet ID:', goalSheet.id);
    console.log('Status:', goalSheet.status);
    console.log('Cycle:', goalSheet.cycle.phase, goalSheet.cycle.year);
    console.log('Cycle Active:', goalSheet.cycle.isActive);
    console.log('Goals:', goalSheet.goals.length);
    console.log('Submitted At:', goalSheet.submittedAt);
    console.log('');

    // Get manager user
    const manager = await prisma.user.findUnique({
      where: { email: 'manager@demo.com' },
      select: {
        id: true,
        name: true,
        email: true,
        subordinates: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!manager) {
      console.log('❌ Manager user not found');
      return;
    }

    console.log('Manager:', manager.name);
    console.log('Email:', manager.email);
    console.log('Direct Reports:', manager.subordinates.length);
    console.log('');

    manager.subordinates.forEach((sub) => {
      console.log(`  - ${sub.name} (${sub.email})`);
    });
    console.log('');

    // Check if employee is in manager's subordinates
    const isSubordinate = manager.subordinates.some((sub) => sub.id === employee.id);
    console.log('Is employee a direct report?', isSubordinate ? '✅ YES' : '❌ NO');
    console.log('');

    if (!isSubordinate) {
      console.log('⚠️  ISSUE: Employee is not assigned to this manager!');
      console.log('   Fix: Update employee.managerId to manager.id');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkManagerRelationship();
