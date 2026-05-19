# Achievement Window Fix

## Issue
Employees and managers cannot log actual results after admin opens Q1 phase because the window date comparison fails.

## Root Cause
When creating a cycle with date inputs (e.g., "2026-05-19"), the backend converts them to Date objects at midnight (00:00:00 UTC). The achievement route checks if the current time is between `windowOpen` and `windowClose`, but if the current time is later in the day, it fails the check.

## Solution
Modify the backend to set:
- `windowOpen` to start of day (00:00:00)
- `windowClose` to end of day (23:59:59.999)

## Files to Modify

### 1. backend/src/routes/admin.ts

#### POST /api/admin/cycles (Line ~35-48)

**Replace:**
```typescript
const cycle = await prisma.goalCycle.create({
  data: { year, phase, windowOpen: new Date(windowOpen), windowClose: new Date(windowClose), isActive: isActive ?? false, createdById: req.user.id },
});
```

**With:**
```typescript
// Convert date strings to Date objects
// Set windowOpen to start of day (00:00:00) and windowClose to end of day (23:59:59)
const openDate = new Date(windowOpen);
openDate.setHours(0, 0, 0, 0);

const closeDate = new Date(windowClose);
closeDate.setHours(23, 59, 59, 999);

const cycle = await prisma.goalCycle.create({
  data: { year, phase, windowOpen: openDate, windowClose: closeDate, isActive: isActive ?? false, createdById: req.user.id },
});
```

#### PUT /api/admin/cycles/:id (Line ~65-75)

**Replace:**
```typescript
const updateData: Record<string, unknown> = {};
if (year !== undefined) updateData.year = year;
if (phase !== undefined) updateData.phase = phase;
if (windowOpen !== undefined) updateData.windowOpen = new Date(windowOpen);
if (windowClose !== undefined) updateData.windowClose = new Date(windowClose);
if (isActive !== undefined) updateData.isActive = isActive;
```

**With:**
```typescript
const updateData: Record<string, unknown> = {};
if (year !== undefined) updateData.year = year;
if (phase !== undefined) updateData.phase = phase;
if (windowOpen !== undefined) {
  const openDate = new Date(windowOpen);
  openDate.setHours(0, 0, 0, 0);
  updateData.windowOpen = openDate;
}
if (windowClose !== undefined) {
  const closeDate = new Date(windowClose);
  closeDate.setHours(23, 59, 59, 999);
  updateData.windowClose = closeDate;
}
if (isActive !== undefined) updateData.isActive = isActive;
```

## Testing

After making these changes:

1. **Restart the backend server**
2. **Create a new Q1 cycle** with today's date as both windowOpen and windowClose
3. **Activate the Q1 cycle**
4. **Login as employee** and try to log achievements
5. **Verify** that the achievement can be saved

## Alternative Quick Fix

If you can't modify the code right now, you can work around this by:

1. **Set windowClose to tomorrow's date** when creating cycles
2. This ensures the current time is always within the window

## Example

When creating a Q1 cycle:
- Window Open: 2026-05-19
- Window Close: 2026-06-30 (or later)

This ensures that any time on 2026-05-19 through 2026-06-30 is valid.
