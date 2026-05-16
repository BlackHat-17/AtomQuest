import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ─── Users ────────────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@demo.com',
      password: adminPassword,
      role: Role.ADMIN,
      department: 'HR',
    },
  });
  console.log(`✅ Admin created: ${admin.email} (id: ${admin.id})`);

  const managerPassword = await bcrypt.hash('Manager@123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@demo.com' },
    update: {},
    create: {
      name: 'Manager User',
      email: 'manager@demo.com',
      password: managerPassword,
      role: Role.MANAGER,
      department: 'Engineering',
    },
  });
  console.log(`✅ Manager created: ${manager.email} (id: ${manager.id})`);

  const employeePassword = await bcrypt.hash('Employee@123', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'employee@demo.com' },
    update: {},
    create: {
      name: 'Employee User',
      email: 'employee@demo.com',
      password: employeePassword,
      role: Role.EMPLOYEE,
      department: 'Engineering',
      managerId: manager.id,
    },
  });
  console.log(`✅ Employee created: ${employee.email} (id: ${employee.id})`);

  // ─── Active GoalCycle ─────────────────────────────────────────────────────

  const now = new Date();
  const windowClose = new Date(now);
  windowClose.setDate(windowClose.getDate() + 30);

  const cycle = await prisma.goalCycle.upsert({
    where: {
      // GoalCycle has no unique constraint on a single field, so we use
      // findFirst + create pattern via a synthetic lookup.
      // Prisma upsert requires a unique field; we use a combination approach:
      // create a deterministic id so re-runs are idempotent.
      id: `seed-cycle-${now.getFullYear()}-GOAL_SETTING`,
    },
    update: {},
    create: {
      id: `seed-cycle-${now.getFullYear()}-GOAL_SETTING`,
      year: now.getFullYear(),
      phase: 'GOAL_SETTING',
      windowOpen: now,
      windowClose,
      isActive: true,
      createdById: admin.id,
    },
  });
  console.log(
    `✅ GoalCycle created: ${cycle.year} ${cycle.phase} (id: ${cycle.id}, active: ${cycle.isActive})`
  );

  console.log('🎉 Seed complete.');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
