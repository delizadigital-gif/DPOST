import { getUnscopedDb } from '@dpost/db';

/**
 * What Meta's callbacks actually do to our data.
 *
 * Both callbacks arrive without a session — they come from Meta, not from a
 * browser — so they use the unscoped client deliberately, after the
 * signature has been verified. They are keyed on the Facebook user id, which
 * is the only thing Meta tells us.
 */

export interface DisconnectResult {
  /** How many connections were removed. Zero is a normal answer. */
  accounts: number;
  channels: number;
}

/**
 * Someone removed DPOST from their Facebook settings. Every Page connected
 * through that account stops being publishable immediately: the tokens are
 * dead anyway, and leaving the Pages listed would promise something we can
 * no longer do.
 */
export async function handleDeauthorize(facebookUserId: string): Promise<DisconnectResult> {
  const db = getUnscopedDb();

  const accounts = await db.socialAccount.findMany({
    where: { platform: 'facebook', externalUserId: facebookUserId },
    select: { id: true, workspaceId: true },
  });
  if (accounts.length === 0) return { accounts: 0, channels: 0 };

  const accountIds = accounts.map((account) => account.id);
  const channels = await db.socialChannel.deleteMany({
    where: { socialAccountId: { in: accountIds } },
  });
  await db.socialAccount.deleteMany({ where: { id: { in: accountIds } } });

  for (const account of accounts) {
    await db.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        actorType: 'system',
        action: 'social.account.deauthorized',
        targetType: 'social_account',
        targetId: account.id,
        metadata: { source: 'meta_webhook' },
      },
    });
  }

  return { accounts: accounts.length, channels: channels.count };
}

export interface DeletionResult extends DisconnectResult {
  /** Page posts we had imported for brand analysis. */
  importedPosts: number;
}

/**
 * A data deletion request. Everything we hold that came from Facebook for
 * this person goes: the connection, the Page tokens, and the imported Page
 * posts kept for brand analysis.
 *
 * The user's own DPOST content — the posts they wrote — is theirs, not
 * Facebook's, and stays. Deleting it would lose work they can still use.
 */
export async function handleDataDeletion(facebookUserId: string): Promise<DeletionResult> {
  const db = getUnscopedDb();

  const accounts = await db.socialAccount.findMany({
    where: { platform: 'facebook', externalUserId: facebookUserId },
    select: { id: true, workspaceId: true },
  });
  if (accounts.length === 0) return { accounts: 0, channels: 0, importedPosts: 0 };

  const accountIds = accounts.map((account) => account.id);
  const channelRows = await db.socialChannel.findMany({
    where: { socialAccountId: { in: accountIds } },
    select: { id: true },
  });
  const channelIds = channelRows.map((channel) => channel.id);

  const importedPosts = await db.importedPost.deleteMany({
    where: { channelId: { in: channelIds } },
  });
  const channels = await db.socialChannel.deleteMany({ where: { id: { in: channelIds } } });
  await db.socialAccount.deleteMany({ where: { id: { in: accountIds } } });

  for (const account of accounts) {
    await db.auditLog.create({
      data: {
        workspaceId: account.workspaceId,
        actorType: 'system',
        action: 'social.data_deleted',
        targetType: 'social_account',
        targetId: account.id,
        metadata: { source: 'meta_webhook', importedPosts: importedPosts.count },
      },
    });
  }

  return {
    accounts: accounts.length,
    channels: channels.count,
    importedPosts: importedPosts.count,
  };
}
