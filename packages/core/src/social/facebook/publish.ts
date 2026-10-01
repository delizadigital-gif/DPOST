import { graphRequest } from './client';
import { validatePost } from './validate';

/**
 * Putting a post on a Page.
 *
 * Three shapes, because Facebook treats them as three different endpoints:
 *
 * - text, or text with a link → `POST /{page-id}/feed`
 * - one photo                 → `POST /{page-id}/photos`
 * - several photos            → each uploaded unpublished, then attached to
 *                               a single `/feed` post
 *
 * The post text and its hashtags are joined here, in one place, so what the
 * preview shows and what Facebook receives cannot drift apart.
 */

export interface PublishInput {
  pageId: string;
  pageToken: string;
  body: string;
  hashtags?: string[];
  link?: string | null;
  /** Publicly reachable image URLs. Phase 9 uploads ours to storage first. */
  imageUrls?: string[];
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}

export interface PublishResult {
  /** Facebook's id for the new post, used to read it back later. */
  externalPostId: string;
  /** A link a person can open, when we can build one. */
  externalUrl: string | null;
  usagePercent?: number;
}

/** What actually gets sent: the caption and its hashtag line. */
export function renderMessage(body: string, hashtags: readonly string[] = []): string {
  const tags = hashtags
    .map((tag) => tag.replace(/^#+/u, '').trim())
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return [body.trim(), tags.join(' ')].filter(Boolean).join('\n\n');
}

/**
 * Builds the link to the published post. Facebook returns an id of the form
 * `{pageId}_{postId}`; the permalink is built from its two halves.
 */
export function permalinkFor(externalPostId: string): string | null {
  const [pageId, postId] = externalPostId.split('_');
  if (!pageId || !postId) return null;
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

export async function publishToPage(input: PublishInput): Promise<PublishResult> {
  const message = renderMessage(input.body, input.hashtags ?? []);

  // The same validator the composer uses as you type. Reaching Facebook with
  // something we already know it will refuse wastes an attempt and a minute.
  const { ok, issues } = validatePost({
    body: input.body,
    hashtags: input.hashtags ?? [],
    link: input.link ?? null,
    hasImage: (input.imageUrls?.length ?? 0) > 0,
  });
  if (!ok) {
    const problem = issues.find((issue) => issue.level === 'error');
    throw new Error(problem?.message ?? 'This post cannot be published as it is.');
  }

  const images = input.imageUrls ?? [];
  const common = {
    token: input.pageToken,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
  };

  if (images.length === 1) {
    const { data, usagePercent } = await graphRequest<{ id: string; post_id?: string }>({
      ...common,
      path: `${input.pageId}/photos`,
      method: 'POST',
      params: { url: images[0]!, message, published: true },
    });
    // `post_id` is the feed story; `id` is the photo itself.
    const externalPostId = data.post_id ?? data.id;
    return {
      externalPostId,
      externalUrl: permalinkFor(externalPostId),
      ...(usagePercent === undefined ? {} : { usagePercent }),
    };
  }

  if (images.length > 1) {
    // Upload each photo without publishing it, then publish one post that
    // attaches them all — Facebook's way of making an album in the feed.
    const mediaIds: string[] = [];
    for (const url of images) {
      const { data } = await graphRequest<{ id: string }>({
        ...common,
        path: `${input.pageId}/photos`,
        method: 'POST',
        params: { url, published: false },
      });
      mediaIds.push(data.id);
    }

    const attached = Object.fromEntries(
      mediaIds.map((id, index) => [`attached_media[${index}]`, JSON.stringify({ media_fbid: id })]),
    );
    const { data, usagePercent } = await graphRequest<{ id: string }>({
      ...common,
      path: `${input.pageId}/feed`,
      method: 'POST',
      params: { message, ...attached },
    });
    return {
      externalPostId: data.id,
      externalUrl: permalinkFor(data.id),
      ...(usagePercent === undefined ? {} : { usagePercent }),
    };
  }

  const { data, usagePercent } = await graphRequest<{ id: string }>({
    ...common,
    path: `${input.pageId}/feed`,
    method: 'POST',
    params: { message, ...(input.link ? { link: input.link } : {}) },
  });
  return {
    externalPostId: data.id,
    externalUrl: permalinkFor(data.id),
    ...(usagePercent === undefined ? {} : { usagePercent }),
  };
}
