import { describe, expect, it } from 'vitest';
import { safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it('allows same-site paths', () => {
    expect(safeNextPath('/calendar?view=week')).toBe('/calendar?view=week');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'home',
    '',
    null,
    undefined,
  ])('falls back for %s', (next) => {
    expect(safeNextPath(next)).toBe('/home');
  });
});
