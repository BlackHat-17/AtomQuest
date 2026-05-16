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
