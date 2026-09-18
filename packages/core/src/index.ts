export { AppError, ERROR_CODES, isAppError, toPublicError } from './lib/errors';
export type { AppErrorOptions, ErrorCode, PublicError } from './lib/errors';
export { createLogger, REDACT_PATHS } from './lib/logger';
export type { CreateLoggerOptions, Logger } from './lib/logger';
export { decryptSecret, encryptSecret, getKeyring } from './lib/crypto';
export type { EncryptedValue, Keyring } from './lib/crypto';
export { createRedis, disconnectRedis, getRedis } from './lib/redis';
export type { Redis } from './lib/redis';
export { checkRateLimit, enforceRateLimit, RATE_LIMITS } from './lib/rate-limit';
export type { RateLimitBucket, RateLimitResult, RateLimitRule } from './lib/rate-limit';

export { assertCan, can, PERMISSIONS } from './authz/permissions';
export type { Permission } from './authz/permissions';
export { createContext, newRequestId } from './context';
export type { Context, CreateContextInput, RequestSource } from './context';

export { recordAudit } from './services/audit';
export type { AuditEntry } from './services/audit';
export { checkHealth } from './services/health';
export type { HealthReport } from './services/health';
export { getMe } from './services/account';
export type { MeResponse } from './services/account';
