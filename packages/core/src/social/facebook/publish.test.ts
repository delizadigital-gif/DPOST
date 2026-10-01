import { describe, expect, it, vi } from 'vitest';
import { GraphError } from './client';
import { permalinkFor, publishToPage, renderMessage } from './publish';

/**
 * The adapter against recorded Graph API responses. A fake `fetch` stands in
 * for the network, so these are real tests of our request building and error
 * handling without a Facebook app or a live Page.
 */

function recorder(
  responses: { status: number; body: unknown; headers?: Record<string, string> }[],
): { fetchImpl: typeof fetch; calls: { url: string; body: string; auth: string }[] } {
  const calls: { url: string; body: string; auth: string }[] = [];
  let index = 0;

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      body: String(init?.body ?? ''),
      auth: headers.get('authorization') ?? '',
    });
    const next = responses[Math.min(index++, responses.length - 1)]!;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: next.headers,
    });
  });

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const base = {
  pageId: '1234567890',
  pageToken: 'EAAG-page-token-never-logged',
  graphVersion: 'v23.0',
};

describe('what gets sent', () => {
  it('joins the caption and the hashtag line', () => {
    expect(renderMessage('Fresh batch today.', ['homemade', '#dhaka'])).toBe(
      'Fresh batch today.\n\n#homemade #dhaka',
    );
  });

  it('leaves out the hashtag line when there are none', () => {
    expect(renderMessage('Fresh batch today.', [])).toBe('Fresh batch today.');
  });
});

describe('a text post', () => {
  it('posts to the Page feed and returns a link', async () => {
    const { fetchImpl, calls } = recorder([{ status: 200, body: { id: '1234567890_9876543210' } }]);

    const result = await publishToPage({
      ...base,
      body: 'Fresh batch out of the kitchen this morning.',
      hashtags: ['homemade'],
      fetchImpl,
    });

    expect(calls[0]?.url).toContain('/v23.0/1234567890/feed');
    expect(calls[0]?.body).toContain('message=Fresh+batch');
    expect(calls[0]?.body).toContain('%23homemade');
    expect(result.externalPostId).toBe('1234567890_9876543210');
    expect(result.externalUrl).toBe('https://www.facebook.com/1234567890/posts/9876543210');
  });

  it('sends the token in the header, never in the URL', async () => {
    const { fetchImpl, calls } = recorder([{ status: 200, body: { id: '1_2' } }]);
    await publishToPage({ ...base, body: 'A post.', fetchImpl });

    expect(calls[0]?.auth).toBe('Bearer EAAG-page-token-never-logged');
    expect(calls[0]?.url).not.toContain('EAAG');
    expect(calls[0]?.body).not.toContain('EAAG');
  });

  it('includes a link when the post has one', async () => {
    const { fetchImpl, calls } = recorder([{ status: 200, body: { id: '1_2' } }]);
    await publishToPage({ ...base, body: 'Read this.', link: 'https://example.com', fetchImpl });
    expect(calls[0]?.body).toContain('link=https%3A%2F%2Fexample.com');
  });

  it('refuses a post the platform rules already reject', async () => {
    const { fetchImpl, calls } = recorder([{ status: 200, body: { id: '1_2' } }]);
    await expect(publishToPage({ ...base, body: '   ', fetchImpl })).rejects.toThrow(/empty/i);
    // Nothing was sent: an attempt we know will fail is not worth making.
    expect(calls).toHaveLength(0);
  });
});

describe('photo posts', () => {
  it('uses the photos endpoint for a single image', async () => {
    const { fetchImpl, calls } = recorder([
      { status: 200, body: { id: 'photo_1', post_id: '1234567890_555' } },
    ]);

    const result = await publishToPage({
      ...base,
      body: 'Today’s batch.',
      imageUrls: ['https://cdn.example.com/one.jpg'],
      fetchImpl,
    });

    expect(calls[0]?.url).toContain('/1234567890/photos');
    expect(calls[0]?.body).toContain('published=true');
    // The feed story, not the photo, is what a person can open.
    expect(result.externalPostId).toBe('1234567890_555');
  });

  it('uploads several photos unpublished, then attaches them to one post', async () => {
    const { fetchImpl, calls } = recorder([
      { status: 200, body: { id: 'media_1' } },
      { status: 200, body: { id: 'media_2' } },
      { status: 200, body: { id: '1234567890_777' } },
    ]);

    const result = await publishToPage({
      ...base,
      body: 'Three new designs.',
      imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
      fetchImpl,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.body).toContain('published=false');
    expect(calls[1]?.body).toContain('published=false');
    expect(calls[2]?.url).toContain('/feed');
    expect(calls[2]?.body).toContain('attached_media%5B0%5D');
    expect(calls[2]?.body).toContain('media_1');
    expect(result.externalPostId).toBe('1234567890_777');
  });
});

describe('when Facebook refuses', () => {
  const failure = async (status: number, body: unknown, headers?: Record<string, string>) => {
    const { fetchImpl } = recorder([{ status, body, headers }]);
    try {
      await publishToPage({ ...base, body: 'A post.', fetchImpl });
      throw new Error('expected a failure');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphError);
      return (error as GraphError).failure;
    }
  };

  it('classifies an expired token as authentication', async () => {
    const result = await failure(400, {
      error: { message: 'Error validating access token', code: 190, fbtrace_id: 'x' },
    });
    expect(result.class).toBe('AUTH');
  });

  it('classifies throttling, with the wait Facebook asked for', async () => {
    const result = await failure(
      400,
      { error: { message: 'Application request limit reached', code: 4 } },
      { 'retry-after': '300' },
    );
    expect(result.class).toBe('RATE_LIMITED');
    expect(result.retryAfterMs).toBe(300_000);
  });

  it('classifies a server error as temporary', async () => {
    expect((await failure(500, { error: { message: 'Internal', code: 2 } })).class).toBe(
      'TRANSIENT',
    );
  });

  it('classifies a rejected post as permanent', async () => {
    const result = await failure(400, {
      error: { message: 'Invalid parameter', code: 100, error_user_msg: 'This link is blocked.' },
    });
    expect(result.class).toBe('PERMANENT');
    expect(result.message).toBe('This link is blocked.');
  });

  it('never carries the token in the error', async () => {
    const result = await failure(400, { error: { message: 'Bad token', code: 190 } });
    expect(JSON.stringify(result)).not.toContain('EAAG');
  });

  it('treats a dropped connection as temporary', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    await expect(publishToPage({ ...base, body: 'A post.', fetchImpl })).rejects.toMatchObject({
      failure: { class: 'TRANSIENT' },
    });
  });
});

describe('permalinks', () => {
  it('builds one from the two halves of the id', () => {
    expect(permalinkFor('111_222')).toBe('https://www.facebook.com/111/posts/222');
  });

  it('returns nothing rather than a broken link', () => {
    expect(permalinkFor('justanid')).toBeNull();
  });
});
