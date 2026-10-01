import type { ContentLanguageCode, DisplayStatus } from '@dpost/core/content';

/**
 * The shape of a post as the browser sees it: the service's `PostSummary`
 * after JSON, where dates are strings. Defined once so the list, the
 * calendar and the sheet all agree.
 */
export interface PostListItem {
  id: string;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  language: ContentLanguageCode;
  contentType: string | null;
  status: DisplayStatus;
  source: string;
  plannedFor: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostPageResponse {
  posts: PostListItem[];
  nextCursor: string | null;
  total: number;
}

export interface BulkResponse {
  changed: number;
  skipped: { id: string; reason: string }[];
}

/** The statuses the filter offers, in the order work moves through them. */
export const FILTER_STATUSES = ['ai_generated', 'pending_review', 'draft', 'approved'] as const;

export function buildPostsQuery(filters: {
  status?: readonly string[];
  search?: string;
  cursor?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.search?.trim()) params.set('q', filters.search.trim());
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return query ? `/api/v1/posts?${query}` : '/api/v1/posts';
}

/** A one-line summary for a row or a calendar chip. */
export function postPreviewLine(post: PostListItem, length = 90): string {
  const text = post.title?.trim() || post.body.replace(/\s+/gu, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
