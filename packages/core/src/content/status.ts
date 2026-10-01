import type { PostStatus } from '@dpost/db';

/**
 * The editorial life of a post.
 *
 * ```
 * draft ─────────────┐
 * ai_generated ──► pending_review ──► approved ──► archived
 *      ▲                  │               │
 *      └── regenerate ◄───┴───── edit ────┘
 * ```
 *
 * Every transition in the product goes through `assertTransition`, so a new
 * screen or an AI tool can't invent a path the rest of the system doesn't
 * know about. Editing an approved post sends it back for review on purpose:
 * approval is a statement about a particular text, not about the post for
 * ever.
 */

export const POST_STATUSES = [
  'draft',
  'ai_generated',
  'pending_review',
  'approved',
  'archived',
] as const;

const TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  // A draft the user is still writing.
  draft: ['pending_review', 'approved', 'archived'],
  // Fresh from the AI, not yet looked at.
  ai_generated: ['pending_review', 'approved', 'draft', 'archived'],
  pending_review: ['approved', 'draft', 'archived'],
  // Editing an approved post withdraws the approval.
  approved: ['pending_review', 'draft', 'archived'],
  // The end of the line: an archived post is restored by un-archiving it.
  archived: ['draft'],
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: PostStatus): readonly PostStatus[] {
  return TRANSITIONS[from];
}

export class StatusTransitionError extends Error {
  constructor(
    readonly from: PostStatus,
    readonly to: PostStatus,
  ) {
    super(`A post cannot go from ${from} to ${to}.`);
    this.name = 'StatusTransitionError';
  }
}

export function assertTransition(from: PostStatus, to: PostStatus): void {
  if (!canTransition(from, to)) throw new StatusTransitionError(from, to);
}

/**
 * Where an edit leaves a post. Editing something already approved returns it
 * to review; anything else keeps its place in the flow.
 */
export function statusAfterEdit(current: PostStatus): PostStatus {
  if (current === 'approved') return 'pending_review';
  if (current === 'ai_generated') return 'pending_review';
  return current;
}

/** Whether a post may still be changed. Archived posts are read-only. */
export function isEditable(status: PostStatus): boolean {
  return status !== 'archived';
}

/**
 * What the interface shows. Delivery state wins when a post has one, because
 * "Published" is more useful to the reader than "Approved" (docs/03, 5.3).
 * Publications arrive in Phase 8; until then there is never one.
 */
export type DisplayStatus =
  PostStatus | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

export function displayStatus(
  status: PostStatus,
  publicationStatus?: string | null,
): DisplayStatus {
  return (publicationStatus as DisplayStatus | undefined) ?? status;
}
