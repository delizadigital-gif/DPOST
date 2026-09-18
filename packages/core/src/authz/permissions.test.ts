import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors';
import { assertCan, can, PERMISSIONS, type Permission } from './permissions';

type Role = 'owner' | 'admin' | 'editor' | 'viewer';
const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];

/**
 * The expected matrix, written out in full so any change to a role's powers
 * shows up as a deliberate diff in this test.
 */
const EXPECTED: Record<Permission, Role[]> = {
  'workspace:read': ['owner', 'admin', 'editor', 'viewer'],
  'workspace:update': ['owner', 'admin'],
  'member:manage': ['owner', 'admin'],
  'billing:manage': ['owner'],
  'social:read': ['owner', 'admin', 'editor', 'viewer'],
  'social:connect': ['owner', 'admin'],
  'brand:read': ['owner', 'admin', 'editor', 'viewer'],
  'brand:update': ['owner', 'admin', 'editor'],
  'post:read': ['owner', 'admin', 'editor', 'viewer'],
  'post:create': ['owner', 'admin', 'editor'],
  'post:update': ['owner', 'admin', 'editor'],
  'post:delete': ['owner', 'admin', 'editor'],
  'post:approve': ['owner', 'admin', 'editor'],
  'post:schedule': ['owner', 'admin', 'editor'],
  'post:publish': ['owner', 'admin', 'editor'],
  'media:read': ['owner', 'admin', 'editor', 'viewer'],
  'media:upload': ['owner', 'admin', 'editor'],
  'media:delete': ['owner', 'admin', 'editor'],
  'ai:use': ['owner', 'admin', 'editor'],
  'analytics:read': ['owner', 'admin', 'editor', 'viewer'],
};

describe('permission matrix', () => {
  it('covers every permission', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS) {
    for (const role of ROLES) {
      const allowed = EXPECTED[permission].includes(role);
      it(`${role} ${allowed ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it('assertCan throws FORBIDDEN when not allowed', () => {
    expect(() => assertCan('viewer', 'post:delete')).toThrow(AppError);
    expect(() => assertCan('owner', 'billing:manage')).not.toThrow();
  });
});
