import { describe, expect, it } from 'vitest';
import type { PostStatus } from '@dpost/db';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  displayStatus,
  isEditable,
  POST_STATUSES,
  statusAfterEdit,
  StatusTransitionError,
} from './status';

describe('allowed transitions', () => {
  it('takes a draft forward for review or straight to approved', () => {
    expect(canTransition('draft', 'pending_review')).toBe(true);
    expect(canTransition('draft', 'approved')).toBe(true);
  });

  it('lets an AI draft be sent back to the writer', () => {
    expect(canTransition('ai_generated', 'draft')).toBe(true);
  });

  it('withdraws approval rather than jumping backwards silently', () => {
    expect(canTransition('approved', 'pending_review')).toBe(true);
    expect(canTransition('approved', 'draft')).toBe(true);
  });

  it('treats archiving as available from anywhere but the archive', () => {
    for (const status of POST_STATUSES) {
      if (status === 'archived') continue;
      expect(canTransition(status, 'archived'), `${status} → archived`).toBe(true);
    }
  });

  it('only un-archives to draft', () => {
    expect(allowedTransitions('archived')).toEqual(['draft']);
    expect(canTransition('archived', 'approved')).toBe(false);
    expect(canTransition('archived', 'pending_review')).toBe(false);
  });

  it('never goes back to ai_generated: a machine wrote that, once', () => {
    for (const status of POST_STATUSES) {
      if (status === 'ai_generated') continue;
      expect(canTransition(status, 'ai_generated'), `${status} → ai_generated`).toBe(false);
    }
  });

  it('treats staying put as allowed', () => {
    for (const status of POST_STATUSES) expect(canTransition(status, status)).toBe(true);
  });

  it('throws with both states named, so the message is useful in a log', () => {
    expect(() => assertTransition('archived', 'approved')).toThrow(StatusTransitionError);
    expect(() => assertTransition('archived', 'approved')).toThrow(/archived to approved/);
    expect(() => assertTransition('draft', 'approved')).not.toThrow();
  });

  it('covers every status in the enum', () => {
    for (const status of POST_STATUSES) {
      expect(allowedTransitions(status as PostStatus)).toBeDefined();
    }
  });
});

describe('what an edit does to the status', () => {
  it('sends an approved post back for review', () => {
    expect(statusAfterEdit('approved')).toBe('pending_review');
  });

  it('moves a machine draft into review once a person touches it', () => {
    expect(statusAfterEdit('ai_generated')).toBe('pending_review');
  });

  it('leaves a draft a draft', () => {
    expect(statusAfterEdit('draft')).toBe('draft');
    expect(statusAfterEdit('pending_review')).toBe('pending_review');
  });
});

describe('what can still be changed', () => {
  it('locks only the archive', () => {
    expect(isEditable('archived')).toBe(false);
    expect(isEditable('approved')).toBe(true);
    expect(isEditable('draft')).toBe(true);
  });
});

describe('the badge the user sees', () => {
  it('shows the editorial status when nothing has been published', () => {
    expect(displayStatus('approved')).toBe('approved');
    expect(displayStatus('approved', null)).toBe('approved');
  });

  it('prefers what actually happened to the post', () => {
    expect(displayStatus('approved', 'published')).toBe('published');
    expect(displayStatus('approved', 'failed')).toBe('failed');
  });
});
