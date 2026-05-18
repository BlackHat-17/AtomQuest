import { prisma } from '../lib/prisma.js';
import type { User, Role } from '@prisma/client';

// ─── Azure AD profile shape (decoded from id_token claims) ───────────────────

export interface AzureADProfile {
  oid: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  groups?: string[];
  /** Extended claims from /me endpoint (manager info) */
  _json?: {
    manager?: {
      mail?: string;
    };
  };
}

// ─── Role resolution from Azure AD group membership ──────────────────────────

function resolveRoleFromGroups(groups: string[] = []): Role {
  const adminGroup = process.env.AAD_GROUP_ADMIN;
  const managerGroup = process.env.AAD_GROUP_MANAGER;
  const employeeGroup = process.env.AAD_GROUP_EMPLOYEE;

  if (adminGroup && groups.includes(adminGroup)) return 'ADMIN';
  if (managerGroup && groups.includes(managerGroup)) return 'MANAGER';
  if (employeeGroup && groups.includes(employeeGroup)) return 'EMPLOYEE';

  // Default to EMPLOYEE if no matching group found
  return 'EMPLOYEE';
}

// ─── Upsert user from Azure AD profile ───────────────────────────────────────

/**
 * Creates or updates a user record based on their Azure AD profile.
 *
 * - Role is derived from Azure AD group membership via env vars
 *   `AAD_GROUP_ADMIN`, `AAD_GROUP_MANAGER`, `AAD_GROUP_EMPLOYEE`
 * - Manager email is read from `profile._json?.manager?.mail`
 * - User is upserted by `azureAdId` (the `oid` claim)
 */
export async function upsertUserFromAzureAD(profile: AzureADProfile): Promise<User> {
  const email = profile.email ?? profile.preferred_username ?? '';
  const name = profile.name ?? email;
  const role = resolveRoleFromGroups(profile.groups);
  const managerEmail = profile._json?.manager?.mail;

  // Resolve manager ID if a manager email is provided
  let managerId: string | null = null;
  if (managerEmail) {
    const manager = await prisma.user.findUnique({ where: { email: managerEmail } });
    managerId = manager?.id ?? null;
  }

  const user = await prisma.user.upsert({
    where: { azureAdId: profile.oid },
    update: {
      name,
      email,
      role,
      ...(managerId !== null ? { managerId } : {}),
    },
    create: {
      azureAdId: profile.oid,
      name,
      email,
      role,
      department: 'General', // Default department; can be updated later
      ...(managerId !== null ? { managerId } : {}),
    },
  });

  return user;
}
