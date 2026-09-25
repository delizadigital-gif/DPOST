import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getWorkspaceUsage, type Context } from '@dpost/core';

/** Plan and AI usage for this month, so limits are visible before they bite. */
export async function QuotaMeter({ ctx }: { ctx: Context }) {
  const t = await getTranslations();
  const usage = await getWorkspaceUsage(ctx);
  const limit = usage.limits.aiPosts;
  const used = usage.used.aiPosts;
  const percent = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));

  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold">{t('shell.usageTitle', { plan: usage.planName })}</p>
        <Link href="/settings" className="text-xs text-primary hover:underline">
          {t('shell.upgrade')}
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {limit === null ? t('shell.usageUnlimited') : t('shell.usagePosts', { used, limit })}
      </p>
      {limit === null ? null : (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('shell.usagePosts', { used, limit })}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
