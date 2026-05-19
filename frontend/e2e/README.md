# E2E Tests — Goal Setting & Tracking Portal

End-to-end tests use [Playwright](https://playwright.dev/) to exercise the full user journeys across Employee, Manager, and Admin roles.

## Setup

### 1. Install Playwright

From the `frontend` directory:

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. Configure the base URL

Create `frontend/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 3. Run the tests

```bash
npx playwright test
npx playwright test e2e/employee.spec.ts
npx playwright test --headed
npx playwright test --ui
```

## Test Structure

```
frontend/e2e/
├── README.md
├── employee.spec.ts    ← Employee journeys
├── manager.spec.ts     ← Manager journeys
└── admin.spec.ts       ← Admin journeys
```

### Demo credentials (from seed script)

| Role     | Email                  | Password      |
|----------|------------------------|---------------|
| Admin    | admin@demo.com         | Admin@123     |
| Manager  | manager@demo.com       | Manager@123   |
| Employee | employee@demo.com      | Employee@123  |

## Notes

- Tests marked with `test.todo()` are stubs — replace with full implementations when ready.
- Use [Playwright's `storageState`](https://playwright.dev/docs/auth) to reuse login sessions across tests.
