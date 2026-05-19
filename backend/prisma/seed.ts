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

  // Extra demo employees
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
