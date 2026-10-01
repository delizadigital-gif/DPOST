import { randomBytes } from 'node:crypto';
import { getMetaEnv, isMetaConfigured } from '@dpost/config';
import type { ConnectionStatus, SocialPlatform } from '@dpost/db';
import { assertCan, assertEmailVerified } from '../authz/permissions';
import type { Context } from '../context';
import { decryptSecret, encryptSecret, getKeyring } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { getRedis } from '../lib/redis';
import {
  buildAuthorizeUrl,
  debugToken,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listManagedPages,
  REQUIRED_SCOPES,
  revokePermissions,
  type ManagedPage,
} from '../social/facebook/oauth';
import { recordAudit } from './audit';
import { notify } from './notifications';

/**
 * Connecting, keeping and letting go of a Facebook Page.
 *
 * Tokens are encrypted at rest with the workspace bound into the encryption
 * context, so a row lifted from one workspace cannot be decrypted for
 * another. They are decrypted only at the moment of a call, never returned
 * by an API and never logged.
 */

/** How long a half-finished connection may sit on Meta's consent screen. */
const STATE_TTL_SECONDS = 600;
const STATE_PREFIX = 'oauth:facebook:';

function tokenContext(workspaceId: string, purpose: 'user' | 'page'): string {
  return `workspace:${workspaceId}:social-${purpose}-token`;
}

export interface ConnectionStart {
  authorizeUrl: string;
  state: string;
}

/**
 * Step one: a single-use state, kept in Redis and bound to this user and
 * workspace, so a callback can't be replayed or aimed at someone else's
 * workspace.
 */
export async function startFacebookConnection(
  ctx: Context,
  redirectUri: string,
): Promise<ConnectionStart> {
  assertCan(ctx.role, 'social:connect');
  // Connecting reaches outside DPOST, so the email has to be confirmed first:
  // it is what keeps throwaway accounts away from our Meta app's standing.
  assertEmailVerified(ctx);

  const env = getMetaEnv();
  if (!isMetaConfigured(env)) {
    throw new AppError('PLATFORM_ERROR', {
      message: 'Connecting a Facebook Page is not set up on this server yet.',
      details: { reason: 'meta_not_configured' },
    });
  }

  const state = randomBytes(32).toString('base64url');
  await getRedis().set(
    `${STATE_PREFIX}${state}`,
    JSON.stringify({ userId: ctx.userId, workspaceId: ctx.workspaceId, redirectUri }),
    'EX',
    STATE_TTL_SECONDS,
  );

  return {
    state,
    authorizeUrl: buildAuthorizeUrl({
      appId: env.META_APP_ID!,
      redirectUri,
      state,
      configId: env.META_LOGIN_CONFIG_ID,
    }),
  };
}

export interface ConsumedState {
  userId: string;
  workspaceId: string;
  redirectUri: string;
}

/**
 * Reads the state and deletes it in one step, so a callback replayed a
 * second later finds nothing.
 */
export async function consumeConnectionState(state: string): Promise<ConsumedState | null> {
  const key = `${STATE_PREFIX}${state}`;
  const redis = getRedis();
  const raw = await redis.getdel(key).catch(async () => {
    // Older Redis servers have no GETDEL; two calls are still single-use
    // enough, because the delete follows immediately.
    const value = await redis.get(key);
    await redis.del(key);
    return value;
  });
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ConsumedState;
  } catch {
    return null;
  }
}

export interface ConnectedAccount {
  accountId: string;
  displayName: string | null;
  pages: ManagedPage[];
}

/**
 * Step two: the code becomes a long-lived user token, which is stored
 * encrypted. The Pages come back for the picker but nothing is connected
 * yet — choosing which Pages DPOST may post to is the user's decision.
 */
export async function completeFacebookConnection(
  ctx: Context,
  input: { code: string; redirectUri: string; fetchImpl?: typeof fetch },
): Promise<ConnectedAccount> {
  assertCan(ctx.role, 'social:connect');
  const env = getMetaEnv();
  if (!isMetaConfigured(env)) {
    throw new AppError('PLATFORM_ERROR', { message: 'Facebook is not set up on this server.' });
  }

  const shortLived = await exchangeCodeForToken({
    code: input.code,
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    redirectUri: input.redirectUri,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  const longLived = await exchangeForLongLivedToken({
    token: shortLived.access_token,
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  const health = await debugToken({
    token: longLived.access_token,
    appId: env.META_APP_ID!,
    appSecret: env.META_APP_SECRET!,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  const missing = REQUIRED_SCOPES.filter((scope) => !health.scopes.includes(scope));
  if (missing.length > 0) {
    throw new AppError('FORBIDDEN', {
      message:
        'DPOST needs permission to see your Pages and post to them. Please allow those when connecting.',
      details: { missing },
    });
  }

  const pages = await listManagedPages({
    userToken: longLived.access_token,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  const me = await fetchFacebookUser(longLived.access_token, input.fetchImpl);
  const encrypted = encryptSecret(
    longLived.access_token,
    tokenContext(ctx.workspaceId, 'user'),
    getKeyring(),
  );

  const account = await ctx.db.socialAccount.upsert({
    where: {
      workspaceId_platform_externalUserId: {
        workspaceId: ctx.workspaceId,
        platform: 'facebook',
        externalUserId: me.id,
      },
    },
    create: {
      workspaceId: ctx.workspaceId,
      platform: 'facebook',
      externalUserId: me.id,
      displayName: me.name ?? null,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenTag: encrypted.tag,
      tokenKeyVersion: encrypted.keyVersion,
      tokenExpiresAt: health.expiresAt,
      scopes: health.scopes,
      status: 'active',
      lastCheckedAt: new Date(),
      connectedById: ctx.userId,
    },
    update: {
      displayName: me.name ?? null,
      tokenCiphertext: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenTag: encrypted.tag,
      tokenKeyVersion: encrypted.keyVersion,
      tokenExpiresAt: health.expiresAt,
      scopes: health.scopes,
      status: 'active',
      lastCheckedAt: new Date(),
    },
    select: { id: true, displayName: true },
  });

  await recordAudit(ctx, {
    action: 'social.account.connect',
    targetType: 'social_account',
    targetId: account.id,
    metadata: { platform: 'facebook', pages: pages.length },
  });

  return { accountId: account.id, displayName: account.displayName, pages };
}

async function fetchFacebookUser(
  token: string,
  fetchImpl?: typeof fetch,
): Promise<{ id: string; name?: string }> {
  const { graphRequest } = await import('../social/facebook/client');
  const { data } = await graphRequest<{ id: string; name?: string }>({
    path: 'me',
    token,
    params: { fields: 'id,name' },
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return data;
}

/** The Pages on this connection right now, for the picker. */
export async function listAvailablePages(
  ctx: Context,
  accountId: string,
  fetchImpl?: typeof fetch,
): Promise<ManagedPage[]> {
  assertCan(ctx.role, 'social:connect');
  const token = await decryptAccountToken(ctx, accountId);
  return listManagedPages({ userToken: token, ...(fetchImpl ? { fetchImpl } : {}) });
}

export interface ChannelSummary {
  id: string;
  platform: SocialPlatform;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  category: string | null;
  status: ConnectionStatus;
  isActive: boolean;
  accountName: string | null;
  lastSyncedAt: Date | null;
}

export async function listChannels(ctx: Context): Promise<ChannelSummary[]> {
  assertCan(ctx.role, 'social:read');
  const channels = await ctx.db.socialChannel.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      platform: true,
      externalId: true,
      name: true,
      avatarUrl: true,
      category: true,
      status: true,
      isActive: true,
      lastSyncedAt: true,
      socialAccount: { select: { displayName: true } },
    },
  });

  return channels.map(({ socialAccount, ...channel }) => ({
    ...channel,
    accountName: socialAccount?.displayName ?? null,
  }));
}

/**
 * Connects the Pages the user picked. Each Page token is encrypted with the
 * workspace in its context, exactly like the user token.
 */
export async function connectPages(
  ctx: Context,
  accountId: string,
  pages: ManagedPage[],
): Promise<ChannelSummary[]> {
  assertCan(ctx.role, 'social:connect');
  assertEmailVerified(ctx);

  const account = await ctx.db.socialAccount.findFirst({
    where: { id: accountId },
    select: { id: true },
  });
  if (!account) throw new AppError('NOT_FOUND', { message: 'That connection no longer exists.' });

  for (const page of pages) {
    const encrypted = encryptSecret(
      page.accessToken,
      tokenContext(ctx.workspaceId, 'page'),
      getKeyring(),
    );

    await ctx.db.socialChannel.upsert({
      where: {
        workspaceId_platform_externalId: {
          workspaceId: ctx.workspaceId,
          platform: 'facebook',
          externalId: page.id,
        },
      },
      create: {
        workspaceId: ctx.workspaceId,
        socialAccountId: accountId,
        platform: 'facebook',
        kind: 'facebook_page',
        externalId: page.id,
        name: page.name,
        avatarUrl: page.avatarUrl ?? null,
        category: page.category ?? null,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenKeyVersion: encrypted.keyVersion,
        status: 'active',
        isActive: true,
        meta: { tasks: page.tasks },
      },
      update: {
        socialAccountId: accountId,
        name: page.name,
        avatarUrl: page.avatarUrl ?? null,
        category: page.category ?? null,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenKeyVersion: encrypted.keyVersion,
        status: 'active',
        isActive: true,
        meta: { tasks: page.tasks },
      },
    });
  }

  await recordAudit(ctx, {
    action: 'social.channel.connect',
    targetType: 'social_account',
    targetId: accountId,
    metadata: { pages: pages.map((page) => page.id) },
  });

  return listChannels(ctx);
}

/** The Page token, decrypted for one call. Never returned by an API. */
export async function decryptChannelToken(ctx: Context, channelId: string): Promise<string> {
  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: channelId },
    select: { tokenCiphertext: true, tokenIv: true, tokenTag: true, tokenKeyVersion: true },
  });
  if (
    !channel?.tokenCiphertext ||
    !channel.tokenIv ||
    !channel.tokenTag ||
    !channel.tokenKeyVersion
  ) {
    throw new AppError('CONFLICT', {
      message: 'This Page needs reconnecting before DPOST can post to it.',
    });
  }

  return decryptSecret(
    {
      ciphertext: channel.tokenCiphertext,
      iv: channel.tokenIv,
      tag: channel.tokenTag,
      keyVersion: channel.tokenKeyVersion,
    },
    tokenContext(ctx.workspaceId, 'page'),
    getKeyring(),
  );
}

async function decryptAccountToken(ctx: Context, accountId: string): Promise<string> {
  const account = await ctx.db.socialAccount.findFirst({
    where: { id: accountId },
    select: { tokenCiphertext: true, tokenIv: true, tokenTag: true, tokenKeyVersion: true },
  });
  if (!account) throw new AppError('NOT_FOUND', { message: 'That connection no longer exists.' });

  return decryptSecret(
    {
      ciphertext: account.tokenCiphertext,
      iv: account.tokenIv,
      tag: account.tokenTag,
      keyVersion: account.tokenKeyVersion,
    },
    tokenContext(ctx.workspaceId, 'user'),
    getKeyring(),
  );
}

/**
 * Marks a Page as needing to be reconnected, and tells the user once. Called
 * by the publisher when Facebook rejects the token, and by the daily check.
 */
export async function markChannelNeedsReconnect(
  ctx: Context,
  channelId: string,
  reason: string,
): Promise<void> {
  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: channelId },
    select: { id: true, name: true, status: true },
  });
  if (!channel || channel.status === 'needs_reconnect') return;

  await ctx.db.socialChannel.update({
    where: { id: channelId },
    data: { status: 'needs_reconnect' },
  });

  await notify(ctx, {
    type: 'channel_disconnected',
    title: `${channel.name} needs reconnecting`,
    body: reason,
    href: '/channels',
    email: true,
  });

  await recordAudit(ctx, {
    action: 'social.channel.needs_reconnect',
    targetType: 'social_channel',
    targetId: channelId,
    metadata: { reason },
  });
}

/**
 * Disconnects a Page. The Page token is forgotten; the account-level
 * permissions are only handed back when the last Page on that account goes,
 * because the user may still be posting to another Page through it.
 */
export async function disconnectChannel(
  ctx: Context,
  channelId: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  assertCan(ctx.role, 'social:connect');

  const channel = await ctx.db.socialChannel.findFirst({
    where: { id: channelId },
    select: { id: true, socialAccountId: true, name: true },
  });
  if (!channel) throw new AppError('NOT_FOUND', { message: 'That Page is not connected.' });

  await ctx.db.socialChannel.delete({ where: { id: channelId } });

  const remaining = await ctx.db.socialChannel.count({
    where: { socialAccountId: channel.socialAccountId },
  });

  if (remaining === 0) {
    // Hand the permissions back, so the person's Facebook settings tell the
    // truth about what DPOST can still do.
    try {
      const token = await decryptAccountToken(ctx, channel.socialAccountId);
      await revokePermissions({ userToken: token, ...(fetchImpl ? { fetchImpl } : {}) });
    } catch {
      // Revoking is best-effort: the token may already be invalid, and the
      // disconnect must not fail because Facebook refused a goodbye.
    }
    await ctx.db.socialAccount.delete({ where: { id: channel.socialAccountId } });
  }

  await recordAudit(ctx, {
    action: 'social.channel.disconnect',
    targetType: 'social_channel',
    targetId: channelId,
    metadata: { name: channel.name, accountRemoved: remaining === 0 },
  });
}

export interface HealthCheckResult {
  channelId: string;
  ok: boolean;
  reason?: string;
}

/**
 * The daily check: is the token still valid, and does it still carry the
 * permission to post? Finding out on a Tuesday afternoon is far better than
 * finding out when a scheduled post fails at 8pm.
 */
export async function checkChannelHealth(
  ctx: Context,
  channelId: string,
  fetchImpl?: typeof fetch,
): Promise<HealthCheckResult> {
  const env = getMetaEnv();
  if (!isMetaConfigured(env)) return { channelId, ok: true };

  try {
    const token = await decryptChannelToken(ctx, channelId);
    const health = await debugToken({
      token,
      appId: env.META_APP_ID!,
      appSecret: env.META_APP_SECRET!,
      ...(fetchImpl ? { fetchImpl } : {}),
    });

    if (!health.valid) {
      const reason = health.reason ?? 'Facebook no longer accepts this connection.';
      await markChannelNeedsReconnect(ctx, channelId, reason);
      return { channelId, ok: false, reason };
    }

    await ctx.db.socialChannel.update({
      where: { id: channelId },
      data: { lastSyncedAt: new Date() },
    });
    return { channelId, ok: true };
  } catch (error) {
    const reason =
      error instanceof AppError ? error.message : 'We could not check this connection.';
    await markChannelNeedsReconnect(ctx, channelId, reason);
    return { channelId, ok: false, reason };
  }
}
