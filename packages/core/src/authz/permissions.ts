import type { WorkspaceRole } from '@dpost/db';
import { AppError } from '../lib/errors';

/**
 * What each workspace role may do. Every service checks one of these before
 * acting, whichever entry point called it (UI, API, AI agent or worker).
 */
export const PERMISSIONS = [
  'workspace:read',
  'workspace:update',
  'member:manage',
  'billing:manage',
  'social:read',
  'social:connect',
  'brand:read',
  'brand:update',
  'post:read',
  'post:create',
  'post:update',
  'post:delete',
  'post:approve',
  'post:schedule',
  'post:publish',
  'media:read',
  'media:upload',
  'media:delete',
  'ai:use',
  'analytics:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  'workspace:read',
  'social:read',
  'brand:read',
  'post:read',
  'media:read',
  'analytics:read',
];

const EDITOR: Permission[] = [
  ...VIEWER,
  'brand:update',
  'post:create',
  'post:update',
  'post:delete',
  'post:approve',
  'post:schedule',
  'post:publish',
  'media:upload',
  'media:delete',
  'ai:use',
];

const ADMIN: Permission[] = [...EDITOR, 'workspace:update', 'member:manage', 'social:connect'];

const OWNER: Permission[] = [...ADMIN, 'billing:manage'];

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER),
  editor: new Set(EDITOR),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertCan(role: WorkspaceRole, permission: Permission): void {
  if (!can(role, permission)) throw new AppError('FORBIDDEN');
}
