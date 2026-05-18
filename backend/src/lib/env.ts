import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file before validation
dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  // JWT secrets
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // Server
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a number')
    .transform(Number)
    .default('3000'),

  // CORS
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Microsoft Entra ID (Azure AD) SSO — all optional; SSO is disabled when absent
  AAD_TENANT_ID: z.string().optional(),
  AAD_CLIENT_ID: z.string().optional(),
  AAD_CLIENT_SECRET: z.string().optional(),
  AAD_GROUP_ADMIN: z.string().optional(),
  AAD_GROUP_MANAGER: z.string().optional(),
  AAD_GROUP_EMPLOYEE: z.string().optional(),

  // Email notifications via SMTP — all optional; email is disabled when SMTP_HOST is absent
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Microsoft Teams notifications — optional; Teams is disabled when absent
  TEAMS_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates all required environment variables on startup.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment variable validation failed:\n${formatted}\n\nCheck your .env file against .env.example`
    );
  }

  return result.data;
}

export const env = validateEnv();
