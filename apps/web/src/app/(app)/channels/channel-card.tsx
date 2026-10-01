'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { disconnect } from './actions';

export interface ChannelView {
  id: string;
  name: string;
  avatarUrl: string | null;
  category: string | null;
  status: string;
  accountName: string | null;
}

/** One connected Page: how it is doing, and how to let it go. */
export function ChannelCard({ channel }: { channel: ChannelView }) {
  const t = useTranslations('channels');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const needsReconnect = channel.status !== 'active';

  const remove = async () => {
    setBusy(true);
    const result = await disconnect(channel.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('disconnected', { name: channel.name }));
    router.refresh();
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
      {channel.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={channel.avatarUrl}
          alt=""
          width={44}
          height={44}
          className="size-11 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-11 items-center justify-center rounded-full bg-spark text-base font-semibold text-white">
          {channel.name.charAt(0)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-[15px] font-semibold">{channel.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('facebookPage')}
          {channel.accountName ? ` · ${t('via', { name: channel.accountName })}` : ''}
        </p>
      </div>

      {needsReconnect ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber">
          <AlertTriangle className="size-3.5" aria-hidden />
          {t('needsReconnect')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/40 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
          {t('connectedBadge')}
        </span>
      )}

      {needsReconnect ? (
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href="/api/oauth/facebook/start">
            <RefreshCw className="size-3.5" aria-hidden />
            {t('reconnect')}
          </Link>
        </Button>
      ) : null}

      <Button variant="ghost" size="sm" className="h-9" onClick={remove} disabled={busy}>
        <Unplug className="size-3.5" aria-hidden />
        {busy ? t('disconnecting') : t('disconnect')}
      </Button>
    </li>
  );
}
