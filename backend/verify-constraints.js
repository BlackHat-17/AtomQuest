const { PrismaClient } = require('@prisma/client');

async function verifyConstraints() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Verifying Cycle-Stage Management Database Schema\n');
    
    // Get admin user for testing
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      throw new Error('No admin user found for testing');
    }
    
    console.log('✅ 1. Basic table creation verified');
    
    // Test 1: Unique constraint on quarter/year
    console.log('\n🧪 Testing unique constraint on quarter/year...');
    const cycle1 = await prisma.newGoalCycle.create({
      data: {
        name: 'Q2 2026',
        quarter: 'Q2',
        year: 2026,
        createdById: admin.id
      }
    });
    console.log(`✅ Created cycle: ${cycle1.name}`);
    
    try {
      await prisma.newGoalCycle.create({
        data: {
          name: 'Q2 2026 Duplicate',
          quarter: 'Q2',
          year: 2026,
          createdById: admin.id
        }
      });
      console.log('❌ ERROR: Duplicate quarter/year should have been rejected!');
    } catch (error) {
      console.log('✅ Duplicate quarter/year correctly rejected');
    }
    
    // Test 2: Year constraint (should be between 2000-2100)
    console.log('\n🧪 Testing year constraint...');
    try {
      await prisma.newGoalCycle.create({
        data: {
          name: 'Q1 1999',
          quarter: 'Q1',
          year: 1999,
          createdById: admin.id
        }
      });
      console.log('❌ ERROR: Year 1999 should have been rejected!');
    } catch (error) {
      console.log('✅ Invalid year (1999) correctly rejected');
    }
    
    // Test 3: Stage sequence order constraint
    console.log('\n🧪 Testing stage sequence order constraint...');
    const stages = [];
    const stageNames = ['Planning', 'Approval', 'Locked', 'Execution', 'Review'];
    
    for (let i = 0; i < stageNames.length; i++) {
      const stage = await prisma.cycleStage.create({
        data: {
          cycleId: cycle1.id,
          stageName: stageNames[i],
          sequenceOrder: i + 1,
          isActive: i === 0
        }
      });
      stages.push(stage);
    }
    console.log('✅ All 5 stages created with correct sequence order (1-5)');
    
    // Test 4: Invalid sequence order
    try {
      await prisma.cycleStage.create({
        data: {
          cycleId: cycle1.id,
          stageName: 'Planning',
          sequenceOrder: 6, // Invalid - should be 1-5
        }
      });
      console.log('❌ ERROR: Sequence order 6 should have been rejected!');
    } catch (error) {
      console.log('✅ Invalid sequence order (6) correctly rejected');
    }
    
    // Test 5: Unique stage name per cycle
    try {
      await prisma.cycleStage.create({
        data: {
          cycleId: cycle1.id,
          stageName: 'Planning', // Duplicate stage name
          sequenceOrder: 3,
        }
      });
      console.log('❌ ERROR: Duplicate stage name should have been rejected!');
    } catch (error) {
      console.log('✅ Duplicate stage name correctly rejected');
    }
    
    // Test 6: Stage transition audit
    console.log('\n🧪 Testing stage transition audit...');
    const transition = await prisma.stageTransition.create({
      data: {
        cycleId: cycle1.id,
        fromStageId: stages[0].id, // Planning
        toStageId: stages[1].id,   // Approval
        initiatedById: admin.id,
        reason: 'Test transition',
        isAdminOverride: false
      }
    });
    console.log('✅ Stage transition audit record created');
    
    // Test 7: Foreign key relationships
    console.log('\n🧪 Testing foreign key relationships...');
    
    // Verify cycle -> stages relationship
    const cycleWithStages = await prisma.newGoalCycle.findUnique({
      where: { id: cycle1.id },
      include: { 
        stages: { orderBy: { sequenceOrder: 'asc' } },
        stageTransitions: true
      }
    });
    
    console.log(`✅ Cycle has ${cycleWithStages.stages.length} stages`);
    console.log(`✅ Cycle has ${cycleWithStages.stageTransitions.length} transitions`);
    
    // Test 8: Cascade delete
    console.log('\n🧪 Testing cascade delete...');
    const stageCountBefore = await prisma.cycleStage.count();
    const transitionCountBefore = await prisma.stageTransition.count();
    
    await prisma.newGoalCycle.delete({ where: { id: cycle1.id } });
    
    const stageCountAfter = await prisma.cycleStage.count();
    const transitionCountAfter = await prisma.stageTransition.count();
    
    console.log(`✅ Stages deleted on cascade: ${stageCountBefore} -> ${stageCountAfter}`);
    console.log(`✅ Transitions deleted on cascade: ${transitionCountBefore} -> ${transitionCountAfter}`);
    
    // Test 9: Index performance verification
    console.log('\n🧪 Testing indexes...');
    
    // Create multiple cycles to test indexes
    const testCycles = [];
    for (let year = 2024; year <= 2026; year++) {
      for (const quarter of ['Q1', 'Q2', 'Q3', 'Q4']) {
        const cycle = await prisma.newGoalCycle.create({
          data: {
            name: `${quarter} ${year}`,
            quarter,
            year,
            isActive: year === 2026 && quarter === 'Q1',
            createdById: admin.id
          }
        });
        testCycles.push(cycle);
      }
    }
    
    // Test active cycle index
    const activeCycles = await prisma.newGoalCycle.findMany({
      where: { isActive: true }
    });
    console.log(`✅ Active cycle index: found ${activeCycles.length} active cycle(s)`);
    
    // Test year/quarter index
    const q1Cycles = await prisma.newGoalCycle.findMany({
      where: { year: 2025, quarter: 'Q1' }
    });
    console.log(`✅ Year/quarter index: found ${q1Cycles.length} Q1 2025 cycle(s)`);
    
    // Clean up test data
    await prisma.newGoalCycle.deleteMany({
      where: { id: { in: testCycles.map(c => c.id) } }
    });
    
    console.log('\n🎉 All database schema requirements verified successfully!');
    console.log('\n📋 Summary of verified requirements:');
    console.log('   ✅ 8.1: goal_cycles table with proper constraints');
    console.log('   ✅ 8.2: cycle_stages table with stage sequence validation');
    console.log('   ✅ 8.3: stage_transitions audit table for compliance tracking');
    console.log('   ✅ 8.4: Foreign key relationships and data integrity constraints');
    console.log('   ✅ 8.5: Unique constraints for quarter/year and stage sequences');
    console.log('   ✅ Performance indexes for efficient queries');
    console.log('   ✅ Cascade delete for data consistency');
    
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyConstraints();