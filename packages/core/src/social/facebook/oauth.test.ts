import { describe, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, listManagedPages, REQUIRED_SCOPES } from './oauth';

describe('the authorize link', () => {
  const base = { appId: '123', redirectUri: 'https://app.example.com/api/oauth/facebook/callback' };

  it('asks for exactly the permissions we need', () => {
    const url = new URL(buildAuthorizeUrl({ ...base, state: 'abc' }));
    const scopes = url.searchParams.get('scope')?.split(',') ?? [];
    for (const scope of REQUIRED_SCOPES) expect(scopes).toContain(scope);
    // Nothing that would lengthen App Review without being used.
    expect(scopes).not.toContain('business_management');
    expect(scopes).not.toContain('pages_messaging');
  });

  it('carries the state and the exact redirect', () => {
    const url = new URL(buildAuthorizeUrl({ ...base, state: 'single-use-state' }));
    expect(url.searchParams.get('state')).toBe('single-use-state');
    expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('uses a login configuration when there is one, instead of a scope list', () => {
    const url = new URL(buildAuthorizeUrl({ ...base, state: 'abc', configId: 'cfg_1' }));
    expect(url.searchParams.get('config_id')).toBe('cfg_1');
    expect(url.searchParams.get('scope')).toBeNull();
  });
});

describe('the Pages we offer', () => {
  const respond = (body: unknown) =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ) as unknown as typeof fetch;

  it('offers only Pages the person can actually post to', async () => {
    const pages = await listManagedPages({
      userToken: 'user-token',
      fetchImpl: respond({
        data: [
          { id: '1', name: 'Can post', access_token: 't1', tasks: ['CREATE_CONTENT', 'ANALYZE'] },
          { id: '2', name: 'Read only', access_token: 't2', tasks: ['ANALYZE'] },
          { id: '3', name: 'No tasks at all', access_token: 't3' },
        ],
      }),
    });

    // Offering a Page we would be refused on is a promise we cannot keep.
    expect(pages.map((page) => page.id)).toEqual(['1']);
  });

  it('keeps the details the picker shows', async () => {
    const pages = await listManagedPages({
      userToken: 'user-token',
      fetchImpl: respond({
        data: [
          {
            id: '1',
            name: "Rahim's Kitchen",
            access_token: 'page-token',
            category: 'Restaurant',
            tasks: ['CREATE_CONTENT'],
            picture: { data: { url: 'https://cdn.example.com/a.jpg' } },
          },
        ],
      }),
    });

    expect(pages[0]).toMatchObject({
      name: "Rahim's Kitchen",
      category: 'Restaurant',
      avatarUrl: 'https://cdn.example.com/a.jpg',
      accessToken: 'page-token',
    });
  });

  it('copes with an empty list', async () => {
    expect(await listManagedPages({ userToken: 't', fetchImpl: respond({ data: [] }) })).toEqual(
      [],
    );
  });
});
