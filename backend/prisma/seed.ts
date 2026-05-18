import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function computeScore(uomType: string, target: string, actual: string): number {
  switch (uomType) {
    case 'NUMERIC_MIN': {
      const t = parseFloat(target); const a = parseFloat(actual);
      if (t === 0) return 0;
      return Math.min(a / t, 2);
    }
    case 'NUMERIC_MAX': {
      const t = parseFloat(target); const a = parseFloat(actual);
      if (a === 0) return 1;
      return Math.min(t / a, 2);
    }
    case 'TIMELINE': {
      const deadline = new Date(target).getTime();
      const completed = new Date(actual).getTime();
      if (completed <= deadline) return 1;
      const daysLate = (completed - deadline) / (1000 * 60 * 60 * 24);
      return Math.max(0, 1 - daysLate / 30);
    }
    case 'ZERO': {
      const a = parseFloat(actual);
      return a === 0 ? 1 : 0;
    }
    default: return 0;
  }
}

async function main() {
  console.log('🌱 Starting seed...');

  // ─── Users ────────────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { name: 'Admin User', email: 'admin@demo.com', password: adminPassword, role: Role.ADMIN, department: 'HR' },
  });

  const managerPassword = await bcrypt.hash('Manager@123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@demo.com' },
    update: {},
    create: { name: 'Manager User', email: 'manager@demo.com', password: managerPassword, role: Role.MANAGER, department: 'Engineering' },
  });

  const employeePassword = await bcrypt.hash('Employee@123', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'employee@demo.com' },
    update: {},
    create: { name: 'Employee User', email: 'employee@demo.com', password: employeePassword, role: Role.EMPLOYEE, department: 'Engineering', managerId: manager.id },
  });

  // Extra demo employees for richer analytics
  const emp2 = await prisma.user.upsert({
    where: { email: 'alice@demo.com' },
    update: {},
    create: { name: 'Alice Chen', email: 'alice@demo.com', password: employeePassword, role: Role.EMPLOYEE, department: 'Engineering', managerId: manager.id },
  });
  const emp3 = await prisma.user.upsert({
    where: { email: 'bob@demo.com' },
    update: {},
    create: { name: 'Bob Kumar', email: 'bob@demo.com', password: employeePassword, role: Role.EMPLOYEE, department: 'Sales', managerId: manager.id },
  });
  const emp4 = await prisma.user.upsert({
    where: { email: 'carol@demo.com' },
    update: {},
    create: { name: 'Carol Smith', email: 'carol@demo.com', password: employeePassword, role: Role.EMPLOYEE, department: 'Sales', managerId: manager.id },
  });

  console.log('✅ Users created');

  // ─── Goal Cycles ──────────────────────────────────────────────────────────

  const now = new Date();
  const year = now.getFullYear();

  // Check if cycles already exist - if so, skip creation to avoid conflicts
  const existingCycles = await prisma.goalCycle.findMany({ where: { year } });
  
  let goalSettingCycle, q1Cycle, q2Cycle, q3Cycle, q4Cycle;

  if (existingCycles.length > 0) {
    // Use existing cycles and update their active status
    goalSettingCycle = existingCycles.find(c => c.phase === 'GOAL_SETTING') ?? existingCycles[0];
    q1Cycle = existingCycles.find(c => c.phase === 'Q1') ?? existingCycles[0];
    q2Cycle = existingCycles.find(c => c.phase === 'Q2') ?? existingCycles[0];
    q3Cycle = existingCycles.find(c => c.phase === 'Q3') ?? existingCycles[0];
    q4Cycle = existingCycles.find(c => c.phase === 'Q4') ?? existingCycles[0];

    // Update active status for existing cycles
    if (goalSettingCycle) {
      await prisma.goalCycle.update({
        where: { id: goalSettingCycle.id },
        data: { isActive: true },
      });
    }
    if (q2Cycle) {
      await prisma.goalCycle.update({
        where: { id: q2Cycle.id },
        data: { isActive: true },
      });
    }
    if (q3Cycle) {
      await prisma.goalCycle.update({
        where: { id: q3Cycle.id },
        data: { isActive: true },
      });
    }
  } else {
    // Create new cycles
    goalSettingCycle = await prisma.goalCycle.create({
      data: {
        year, phase: 'GOAL_SETTING',
        windowOpen: new Date(`${year}-01-01`),
        windowClose: new Date(`${year}-03-31`),
        isActive: true,
        createdById: admin.id,
      },
    });

    q1Cycle = await prisma.goalCycle.create({
      data: {
        year, phase: 'Q1',
        windowOpen: new Date(`${year}-01-01`),
        windowClose: new Date(`${year}-03-31`),
        isActive: false,
        createdById: admin.id,
      },
    });

    q2Cycle = await prisma.goalCycle.create({
      data: {
        year, phase: 'Q2',
        windowOpen: new Date(`${year}-04-01`),
        windowClose: new Date(`${year}-06-30`),
        isActive: true,
        createdById: admin.id,
      },
    });

    q3Cycle = await prisma.goalCycle.create({
      data: {
        year, phase: 'Q3',
        windowOpen: new Date(`${year}-07-01`),
        windowClose: new Date(`${year + 1}-12-31`), // keep open for demo
        isActive: true,
        createdById: admin.id,
      },
    });

    q4Cycle = await prisma.goalCycle.create({
      data: {
        year, phase: 'Q4',
        windowOpen: new Date(`${year}-10-01`),
        windowClose: new Date(`${year + 1}-12-31`),
        isActive: false,
        createdById: admin.id,
      },
    });
  }

  console.log('✅ Goal cycles created');

  // ─── Helper: create a full goal sheet with goals + achievements ───────────

  async function createDemoSheet(
    empId: string,
    cycleId: string,
    status: 'LOCKED' | 'SUBMITTED' | 'DRAFT',
    approvedById: string | null,
    goals: Array<{
      thrustArea: string; title: string; description: string;
      uomType: string; target: string; weightage: number;
      achievements?: Array<{ quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'; actual: string }>;
    }>
  ) {
    // Check if sheet already exists
    const existing = await prisma.goalSheet.findUnique({
      where: { employeeId_cycleId: { employeeId: empId, cycleId } },
    });
    if (existing) return existing;

    const sheet = await prisma.goalSheet.create({
      data: {
        employeeId: empId,
        cycleId,
        status,
        submittedAt: status !== 'DRAFT' ? new Date() : null,
        approvedAt: status === 'LOCKED' ? new Date() : null,
        approvedById: status === 'LOCKED' ? approvedById : null,
      },
    });

    for (const g of goals) {
      const goal = await prisma.goal.create({
        data: {
          goalSheetId: sheet.id,
          thrustArea: g.thrustArea,
          title: g.title,
          description: g.description,
          uomType: g.uomType as 'NUMERIC_MIN' | 'NUMERIC_MAX' | 'TIMELINE' | 'ZERO',
          target: g.target,
          weightage: g.weightage,
          isLocked: status === 'LOCKED',
          status: 'ON_TRACK',
        },
      });

      if (g.achievements && status === 'LOCKED') {
        for (const ach of g.achievements) {
          const score = computeScore(g.uomType, g.target, ach.actual);
          await prisma.achievement.upsert({
            where: { goalId_quarter: { goalId: goal.id, quarter: ach.quarter } },
            update: {},
            create: {
              goalId: goal.id,
              quarter: ach.quarter,
              actual: ach.actual,
              score,
              updatedById: empId,
            },
          });
        }
      }
    }

    return sheet;
  }

  // ─── Employee User — full sheet with 8 goals + Q1/Q2 achievements ─────────

  await createDemoSheet(employee.id, goalSettingCycle.id, 'LOCKED', manager.id, [
    {
      thrustArea: 'Revenue', title: 'Increase quarterly revenue', description: 'Drive revenue growth through new client acquisition and upselling.', uomType: 'NUMERIC_MIN', target: '500000', weightage: 20,
      achievements: [{ quarter: 'Q1', actual: '420000' }, { quarter: 'Q2', actual: '510000' }],
    },
    {
      thrustArea: 'Quality', title: 'Reduce bug count by 30%', description: 'Improve code quality through better testing and code reviews.', uomType: 'NUMERIC_MAX', target: '10', weightage: 15,
      achievements: [{ quarter: 'Q1', actual: '14' }, { quarter: 'Q2', actual: '8' }],
    },
    {
      thrustArea: 'Delivery', title: 'Ship 3 major features', description: 'Deliver 3 high-impact product features on schedule.', uomType: 'NUMERIC_MIN', target: '3', weightage: 15,
      achievements: [{ quarter: 'Q1', actual: '2' }, { quarter: 'Q2', actual: '3' }],
    },
    {
      thrustArea: 'People', title: 'Complete leadership training', description: 'Complete the company leadership development program.', uomType: 'TIMELINE', target: `${year}-06-30`, weightage: 10,
      achievements: [{ quarter: 'Q2', actual: `${year}-05-15` }],
    },
    {
      thrustArea: 'Customer', title: 'Achieve NPS score of 8+', description: 'Improve customer satisfaction scores through better support.', uomType: 'NUMERIC_MIN', target: '8', weightage: 15,
      achievements: [{ quarter: 'Q1', actual: '7.2' }, { quarter: 'Q2', actual: '8.5' }],
    },
    {
      thrustArea: 'Innovation', title: 'Submit 2 process improvement ideas', description: 'Identify and document 2 process improvements for the team.', uomType: 'NUMERIC_MIN', target: '2', weightage: 10,
      achievements: [{ quarter: 'Q1', actual: '1' }, { quarter: 'Q2', actual: '2' }],
    },
    {
      thrustArea: 'Safety', title: 'Zero security incidents', description: 'Maintain zero security incidents in production systems.', uomType: 'ZERO', target: '0', weightage: 10,
      achievements: [{ quarter: 'Q1', actual: '0' }, { quarter: 'Q2', actual: '0' }],
    },
    {
      thrustArea: 'Cost', title: 'Reduce infrastructure costs by 15%', description: 'Optimize cloud resource usage to reduce monthly costs.', uomType: 'NUMERIC_MAX', target: '15', weightage: 5,
      achievements: [{ quarter: 'Q1', actual: '8' }, { quarter: 'Q2', actual: '16' }],
    },
  ]);

  // ─── Alice Chen — Engineering ─────────────────────────────────────────────

  await createDemoSheet(emp2.id, goalSettingCycle.id, 'LOCKED', manager.id, [
    {
      thrustArea: 'Quality', title: 'Achieve 95% test coverage', description: 'Increase automated test coverage across all modules.', uomType: 'NUMERIC_MIN', target: '95', weightage: 25,
      achievements: [{ quarter: 'Q1', actual: '88' }, { quarter: 'Q2', actual: '94' }],
    },
    {
      thrustArea: 'Delivery', title: 'Complete API migration', description: 'Migrate legacy REST APIs to GraphQL.', uomType: 'TIMELINE', target: `${year}-09-30`, weightage: 25,
      achievements: [{ quarter: 'Q2', actual: `${year}-08-20` }],
    },
    {
      thrustArea: 'People', title: 'Mentor 2 junior developers', description: 'Provide regular mentoring sessions to junior team members.', uomType: 'NUMERIC_MIN', target: '2', weightage: 25,
      achievements: [{ quarter: 'Q1', actual: '1' }, { quarter: 'Q2', actual: '2' }],
    },
    {
      thrustArea: 'Innovation', title: 'Publish 3 technical blog posts', description: 'Share engineering knowledge through the company tech blog.', uomType: 'NUMERIC_MIN', target: '3', weightage: 25,
      achievements: [{ quarter: 'Q1', actual: '1' }, { quarter: 'Q2', actual: '2' }],
    },
  ]);

  // ─── Bob Kumar — Sales ────────────────────────────────────────────────────

  await createDemoSheet(emp3.id, goalSettingCycle.id, 'LOCKED', manager.id, [
    {
      thrustArea: 'Revenue', title: 'Close 20 new enterprise deals', description: 'Acquire 20 new enterprise customers in the fiscal year.', uomType: 'NUMERIC_MIN', target: '20', weightage: 40,
      achievements: [{ quarter: 'Q1', actual: '6' }, { quarter: 'Q2', actual: '11' }],
    },
    {
      thrustArea: 'Customer', title: 'Maintain 90% renewal rate', description: 'Ensure existing customers renew their contracts.', uomType: 'NUMERIC_MIN', target: '90', weightage: 35,
      achievements: [{ quarter: 'Q1', actual: '88' }, { quarter: 'Q2', actual: '92' }],
    },
    {
      thrustArea: 'Cost', title: 'Reduce CAC by 20%', description: 'Optimize sales process to reduce customer acquisition cost.', uomType: 'NUMERIC_MAX', target: '20', weightage: 25,
      achievements: [{ quarter: 'Q1', actual: '12' }, { quarter: 'Q2', actual: '22' }],
    },
  ]);

  // ─── Carol Smith — Sales ──────────────────────────────────────────────────

  await createDemoSheet(emp4.id, goalSettingCycle.id, 'SUBMITTED', manager.id, [
    {
      thrustArea: 'Revenue', title: 'Achieve $300K in new ARR', description: 'Generate $300,000 in new annual recurring revenue.', uomType: 'NUMERIC_MIN', target: '300000', weightage: 50,
    },
    {
      thrustArea: 'Customer', title: 'Conduct 50 product demos', description: 'Run 50 product demonstrations for prospective clients.', uomType: 'NUMERIC_MIN', target: '50', weightage: 30,
    },
    {
      thrustArea: 'People', title: 'Complete sales certification', description: 'Obtain the advanced sales methodology certification.', uomType: 'TIMELINE', target: `${year}-12-31`, weightage: 20,
    },
  ]);

  // ─── Manager's own sheet (for Push KPI) ───────────────────────────────────

  await createDemoSheet(manager.id, goalSettingCycle.id, 'LOCKED', admin.id, [
    {
      thrustArea: 'People', title: 'Team engagement score 85%+', description: 'Improve team engagement through regular 1:1s and feedback.', uomType: 'NUMERIC_MIN', target: '85', weightage: 30,
      achievements: [{ quarter: 'Q1', actual: '80' }, { quarter: 'Q2', actual: '87' }],
    },
    {
      thrustArea: 'Delivery', title: 'Sprint velocity +20%', description: 'Increase team sprint velocity by 20% through process improvements.', uomType: 'NUMERIC_MIN', target: '20', weightage: 30,
      achievements: [{ quarter: 'Q1', actual: '12' }, { quarter: 'Q2', actual: '22' }],
    },
    {
      thrustArea: 'Quality', title: 'Zero P0 incidents in production', description: 'Maintain zero critical production incidents through better QA.', uomType: 'ZERO', target: '0', weightage: 20,
      achievements: [{ quarter: 'Q1', actual: '0' }, { quarter: 'Q2', actual: '0' }],
    },
    {
      thrustArea: 'Revenue', title: 'Deliver 2 revenue-generating features', description: 'Ship 2 features that directly contribute to revenue growth.', uomType: 'NUMERIC_MIN', target: '2', weightage: 20,
      achievements: [{ quarter: 'Q1', actual: '1' }, { quarter: 'Q2', actual: '2' }],
    },
  ]);

  // ─── Check-ins ────────────────────────────────────────────────────────────

  // Add Q1 check-ins for employee and alice
  const empSheet = await prisma.goalSheet.findUnique({
    where: { employeeId_cycleId: { employeeId: employee.id, cycleId: goalSettingCycle.id } },
  });
  const aliceSheet = await prisma.goalSheet.findUnique({
    where: { employeeId_cycleId: { employeeId: emp2.id, cycleId: goalSettingCycle.id } },
  });

  if (empSheet) {
    await prisma.checkIn.upsert({
      where: { goalSheetId_quarter: { goalSheetId: empSheet.id, quarter: 'Q1' } },
      update: {},
      create: {
        goalSheetId: empSheet.id, quarter: 'Q1', managerId: manager.id,
        comment: 'Good progress on revenue goals. Need to focus more on quality metrics in Q2.',
        completedAt: new Date(`${year}-04-05`),
      },
    });
    await prisma.checkIn.upsert({
      where: { goalSheetId_quarter: { goalSheetId: empSheet.id, quarter: 'Q2' } },
      update: {},
      create: {
        goalSheetId: empSheet.id, quarter: 'Q2', managerId: manager.id,
        comment: 'Excellent improvement across all metrics. Revenue target exceeded. Keep up the momentum.',
        completedAt: new Date(`${year}-07-08`),
      },
    });
  }

  if (aliceSheet) {
    await prisma.checkIn.upsert({
      where: { goalSheetId_quarter: { goalSheetId: aliceSheet.id, quarter: 'Q1' } },
      update: {},
      create: {
        goalSheetId: aliceSheet.id, quarter: 'Q1', managerId: manager.id,
        comment: 'Test coverage improving steadily. API migration on track.',
        completedAt: new Date(`${year}-04-06`),
      },
    });
  }

  console.log('✅ Goal sheets, goals, achievements, and check-ins created');
  console.log('🎉 Seed complete!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  Admin:    admin@demo.com    / Admin@123');
  console.log('  Manager:  manager@demo.com  / Manager@123');
  console.log('  Employee: employee@demo.com / Employee@123');
  console.log('  Alice:    alice@demo.com    / Employee@123');
  console.log('  Bob:      bob@demo.com      / Employee@123');
  console.log('  Carol:    carol@demo.com    / Employee@123');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
