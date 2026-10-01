/**
 * Post content rules that are safe to run in a browser: no database, no
 * Redis, no API keys. The composer imports these so that the checks it makes
 * as you type are the same ones the server makes when you save.
 */
export {
  CONTENT_LANGUAGES,
  CONTENT_TYPES,
  MAX_DRAFTS_PER_REQUEST,
  normaliseDraft,
  normaliseHashtags,
  postDraftSchema,
  postDraftsSchema,
  rewriteResultSchema,
} from '../ai/schemas';
export type { ContentLanguageCode, ContentTypeCode, PostDraft, RewriteResult } from '../ai/schemas';
export { REWRITE_ACTIONS } from '../ai/prompts/post-writer.v1';
export type { RewriteAction } from '../ai/prompts/post-writer.v1';
export type { QualityCode, QualityIssue } from '../ai/quality';
export {
  FACEBOOK_MAX_LENGTH,
  MAX_HASHTAGS,
  RECOMMENDED_HASHTAGS,
  RECOMMENDED_MAX_LENGTH,
  SEE_MORE_LENGTH,
  validatePost,
} from '../social/facebook/validate';
export type {
  PostForValidation,
  ValidationIssue,
  ValidationResult,
} from '../social/facebook/validate';

export {
  allowedTransitions,
  canTransition,
  displayStatus,
  isEditable,
  POST_STATUSES,
  statusAfterEdit,
} from './status';
export type { DisplayStatus } from './status';
export {
  addLocalDays,
  calendarRange,
  dayOfWeek,
  groupByLocalDay,
  localDayKey,
  localTimeLabel,
  shiftAnchor,
  startOfLocalDay,
  todayKey,
} from './calendar';
export type { CalendarRange, CalendarView, DayKey, RangeOptions } from './calendar';
