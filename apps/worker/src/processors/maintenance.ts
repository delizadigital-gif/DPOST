import { getMetaEnv, isMetaConfigured } from '@dpost/config';
import { checkChannelHealth, createContext, reconcilePublications, type Logger } from '@dpost/core';
import { getUnscopedDb } from '@dpost/db';

/**
 * The two jobs that keep publishing honest over time.
 *
 * **Reconcile** treats the database as the truth and the queue as a cache:
 * anything overdue and still waiting is queued again, and anything stuck
 * mid-publish because a worker died is released. Without it, a Redis flush
 * would silently swallow a day of scheduled posts.
 *
 * **Token health** asks Facebook whether each stored token still works,
 * daily. Finding out on a Tuesday afternoon, by email, is far better than
 * finding out when tonight's post doesn't go out.
 */

export interface MaintenanceHandle {
  stop(): void;
}

export interface MaintenanceOptions {
  logger: Logger;
  reconcileIntervalMs?: number;
  tokenHealthIntervalMs?: number;
}

export function startMaintenance({
  logger,
  reconcileIntervalMs = 5 * 60_000,
  tokenHealthIntervalMs = 24 * 60 * 60_000,
}: MaintenanceOptions): MaintenanceHandle {
  const reconcile = async () => {
    try {
      const { requeued, unstuck } = await reconcilePublications();
      if (requeued || unstuck) logger.warn({ requeued, unstuck }, 'reconciled publications');
      else logger.debug('nothing to reconcile');
    } catch (error) {
      logger.error({ err: error }, 'reconcile failed');
    }
  };

  const tokenHealth = async () => {
    if (!isMetaConfigured(getMetaEnv())) return;
    try {
      // Cross-workspace by design: this is a system job, so it uses the
      // unscoped client to find the channels, then acts inside each
      // workspace's own context.
      const channels = await getUnscopedDb().socialChannel.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          workspaceId: true,
          socialAccount: { select: { connectedById: true } },
        },
        take: 500,
      });

      let failing = 0;
      for (const channel of channels) {
        const ctx = await createContext({
          userId: channel.socialAccount.connectedById,
          workspaceId: channel.workspaceId,
          emailVerified: true,
          source: 'worker',
        });
        const result = await checkChannelHealth(ctx, channel.id);
        if (!result.ok) failing++;
      }

      logger.info({ checked: channels.length, failing }, 'checked connection health');
    } catch (error) {
      logger.error({ err: error }, 'token health check failed');
    }
  };

  void reconcile();
  const reconcileTimer = setInterval(() => void reconcile(), reconcileIntervalMs);
  const healthTimer = setInterval(() => void tokenHealth(), tokenHealthIntervalMs);
  // The first health check waits a minute, so a restart doesn't hammer Meta.
  const firstHealth = setTimeout(() => void tokenHealth(), 60_000);

  return {
    stop() {
      clearInterval(reconcileTimer);
      clearInterval(healthTimer);
      clearTimeout(firstHealth);
    },
  };
}
