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
