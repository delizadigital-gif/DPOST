export { AppError, ERROR_CODES, isAppError, toPublicError } from './lib/errors';
export type { AppErrorOptions, ErrorCode, PublicError } from './lib/errors';
export { createLogger, REDACT_PATHS } from './lib/logger';
export type { CreateLoggerOptions, Logger } from './lib/logger';
export { decryptSecret, encryptSecret, getKeyring } from './lib/crypto';
export type { EncryptedValue, Keyring } from './lib/crypto';
export { createRedis, disconnectRedis, getRedis } from './lib/redis';
export type { Redis } from './lib/redis';
export { CLIENT_IP_HEADER, clientIpFromHeaders, withClientIpHeader } from './lib/http';
export { checkRateLimit, enforceRateLimit, RATE_LIMITS } from './lib/rate-limit';
export type { RateLimitBucket, RateLimitResult, RateLimitRule } from './lib/rate-limit';

export { assertCan, assertEmailVerified, can, PERMISSIONS } from './authz/permissions';
export type { Permission } from './authz/permissions';
export { createContext, newRequestId } from './context';
export type { Context, CreateContextInput, RequestSource } from './context';

export { recordAudit } from './services/audit';
export type { AuditEntry } from './services/audit';
export { checkHealth } from './services/health';
export type { HealthReport } from './services/health';
export { getMe } from './services/account';
export type { MeResponse } from './services/account';
export { ensurePersonalWorkspace } from './services/workspace';

export { createAuth } from './auth/auth';
export type { Auth, CreateAuthOptions } from './auth/auth';
export { sendEmail } from './email/send';
export type { EmailMessage } from './email/send';
export { listRecentNotifications } from './services/notifications';
export type { NotificationSummary, RecentNotifications } from './services/notifications';
export { currentPeriodStart, getWorkspaceUsage } from './services/usage';
export type { WorkspaceUsage } from './services/usage';

export {
  applyPatch,
  BRAND_SECTIONS,
  BRAND_SOURCES,
  BUSINESS_TYPES,
  EMOJI_USE,
  emptyProfile,
  GOALS,
  HASHTAG_STYLES,
  isBrandSection,
  LANGUAGES,
  parseProfile,
  parseSection,
  patchSchema,
  SECTION_VALUES,
  TONES,
} from './brand/sections';
export type {
  BrandField,
  BrandPatch,
  BrandProfileData,
  BrandSection,
  BrandSectionName,
  BrandSource,
  BrandValues,
} from './brand/sections';
export { renderBrandCard, selectMemories } from './brand/card';
export type { BrandCardInput, MemoryForCard } from './brand/card';
export {
  addBrandMemory,
  completeOnboarding,
  deleteBrandMemory,
  getBrand,
  getBrandCard,
  getOnboardingStatus,
  MAX_MEMORIES,
  updateBrandSection,
  updateBrandSections,
} from './services/brand';
export type {
  AddMemoryInput,
  BrandMemorySummary,
  BrandOverview,
  OnboardingStatus,
  UpdateSectionResult,
} from './services/brand';

export { aiIsAvailable, getModel, setModelOverride } from './ai/models';
export type { ModelRole, ResolvedModel } from './ai/models';
export { createStubModel } from './ai/stub';
export {
  CONTENT_LANGUAGES,
  CONTENT_TYPES,
  MAX_DRAFTS_PER_REQUEST,
  normaliseDraft,
  normaliseHashtags,
  postDraftSchema,
  postDraftsSchema,
  rewriteResultSchema,
} from './ai/schemas';
export type { ContentLanguageCode, ContentTypeCode, PostDraft, RewriteResult } from './ai/schemas';
export { checkDraft, languageMatches, opener, similarity, unverifiedDetails } from './ai/quality';
export type { QualityCode, QualityContext, QualityIssue, QualityReport } from './ai/quality';
export {
  assertCanUse,
  estimateCostMicros,
  getQuota,
  MODEL_PRICING,
  QUOTA_METRICS,
  recordAiUsage,
  recordQuotaUsage,
  withUsage,
} from './ai/usage';
export type { QuotaMetric, QuotaState, UsageRecord } from './ai/usage';
export { REWRITE_ACTIONS } from './ai/prompts/post-writer.v1';
export type { RewriteAction } from './ai/prompts/post-writer.v1';
export { buildPostWriterPrompt, buildRewritePrompt } from './ai/prompts/post-writer.v1';
export { generateDrafts, rewriteDraft } from './ai/pipelines/post-writer';
export type {
  GeneratedDraft,
  GenerateDraftsInput,
  GenerateDraftsResult,
  GenerationMeta,
  RewriteDraftInput,
  RewriteDraftResult,
} from './ai/pipelines/post-writer';
export {
  FACEBOOK_MAX_LENGTH,
  MAX_HASHTAGS,
  RECOMMENDED_HASHTAGS,
  RECOMMENDED_MAX_LENGTH,
  SEE_MORE_LENGTH,
  validatePost,
} from './social/facebook/validate';
export type {
  PostForValidation,
  ValidationIssue,
  ValidationResult,
} from './social/facebook/validate';
export {
  approvePost,
  approvePosts,
  countPostsByStatus,
  createPost,
  deletePost,
  deletePosts,
  duplicatePost,
  getPost,
  listPosts,
  listPostsInRange,
  listRevisions,
  MAX_BULK_POSTS,
  restorePost,
  restorePosts,
  restoreRevision,
  updatePost,
} from './services/posts';
export type {
  BulkResult,
  CreatePostInput,
  ListPostsFilters,
  PostPage,
  PostSummary,
  RevisionSummary,
  UpdatePostInput,
} from './services/posts';
export {
  allowedTransitions,
  assertTransition,
  canTransition,
  displayStatus,
  isEditable,
  POST_STATUSES,
  statusAfterEdit,
  StatusTransitionError,
} from './content/status';
export type { DisplayStatus } from './content/status';
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
  zonedTimeToUtc,
} from './content/calendar';
export type { CalendarRange, CalendarView, DayKey, RangeOptions } from './content/calendar';
export { regeneratePost } from './services/post-ai';
export type { RegeneratePostResult } from './services/post-ai';

export {
  checkChannelHealth,
  completeFacebookConnection,
  connectPages,
  consumeConnectionState,
  decryptChannelToken,
  disconnectChannel,
  listAvailablePages,
  listChannels,
  markChannelNeedsReconnect,
  startFacebookConnection,
} from './services/channels';
export type { ChannelSummary, ConnectedAccount, ConnectionStart } from './services/channels';
export {
  listPublications,
  listUpcoming,
  MIN_LEAD_TIME_MS,
  publishNow,
  retryPublication,
  schedulePost,
  unschedulePost,
} from './services/scheduling';
export type { PublicationSummary, ScheduleInput } from './services/scheduling';
export { reconcilePublications, runPublication } from './services/publishing';
export type { PublishOutcome, RunPublicationInput } from './services/publishing';
export { notify } from './services/notifications';
export type { NotifyInput } from './services/notifications';
export {
  closePublishQueue,
  enqueuePublish,
  getPublishQueue,
  publishJobId,
  PUBLISH_QUEUE,
  PUBLISH_JOB_OPTIONS,
  RECONCILE_QUEUE,
  removePublishJob,
  setPublishQueueOverride,
  TOKEN_HEALTH_QUEUE,
} from './queue/publish-queue';
export type { EnqueuePublishInput, PublishJobData } from './queue/publish-queue';
export { classifyGraphError, isRetryable, usageFromHeaders } from './social/facebook/errors';
export type { ClassifiedFailure, FailureClass } from './social/facebook/errors';
export { GraphError, graphRequest } from './social/facebook/client';
export { permalinkFor, publishToPage, renderMessage } from './social/facebook/publish';
export type { PublishInput, PublishResult } from './social/facebook/publish';
export {
  buildAuthorizeUrl,
  debugToken,
  listManagedPages,
  OPTIONAL_SCOPES,
  REQUIRED_SCOPES,
  revokePermissions,
} from './social/facebook/oauth';
export type { ManagedPage, TokenHealth } from './social/facebook/oauth';
export { deletionConfirmationCode, parseSignedRequest } from './social/facebook/signed-request';
export type { SignedRequestPayload } from './social/facebook/signed-request';
export { handleDataDeletion, handleDeauthorize } from './services/meta-webhooks';
export type { DeletionResult, DisconnectResult } from './services/meta-webhooks';
