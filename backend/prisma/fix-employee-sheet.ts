import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixEmployeeSheet() {
  console.log('🔧 Fixing employee goal sheet...\n');

  try {
    // Get employee
    const employee = await prisma.user.findUnique({
      where: { email: 'employee@demo.com' },
    });

    if (!employee) {
      console.log('❌ Employee not found');
      return;
    }

    // Delete all existing sheets for this employee
    const deleted = await prisma.goalSheet.deleteMany({
      where: { employeeId: employee.id },
    });

    console.log(`✅ Deleted ${deleted.count} existing goal sheet(s)`);
    console.log('');
    console.log('✅ Employee can now create a fresh goal sheet in the GOAL_SETTING cycle');
    console.log('');
    console.log('Next steps:');
    console.log('1. Login as employee@demo.com');
    console.log('2. Navigate to "My Goals" page');
    console.log('3. Add goals (total weightage must equal 100%)');
    console.log('4. Click "Submit for Approval"');
    console.log('5. Manager will see it in Team Dashboard');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmployeeSheet();
