'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarClock, ExternalLink, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiDelete, apiGet, apiPost } from '@/lib/api/client';

/**
 * Scheduling, inside the post sheet.
 *
 * It only appears for an approved post with a connected Page, because every
 * other state would be offering something that cannot happen. What is
 * already queued, published or failed is listed underneath, with a link to
 * the real post on Facebook once it exists.
 */

export interface ChannelOption {
  id: string;
  name: string;
  status: string;
}

interface Publication {
  id: string;
  channelName: string;
  scheduledAt: string;
  status: string;
  externalUrl: string | null;
  failureMessage: string | null;
}

/** `YYYY-MM-DDTHH:mm` in the browser's own zone, for the datetime input. */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function SchedulePanel({
  postId,
  status,
  channels,
}: {
  postId: string;
  status: string;
  channels: ChannelOption[];
}) {
  const t = useTranslations('schedule');
  const router = useRouter();

  const [publications, setPublications] = useState<Publication[]>([]);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 60 * 60_000)));
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiGet<Publication[]>(`/api/v1/posts/${postId}/publications`).then((result) => {
      if (!cancelled && result.ok) setPublications(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const reload = async () => {
    const result = await apiGet<Publication[]>(`/api/v1/posts/${postId}/publications`);
    if (result.ok) setPublications(result.data);
    router.refresh();
  };

  const active = channels.filter((channel) => channel.status === 'active');

  const schedule = async () => {
    setBusy('schedule');
    const result = await apiPost(`/api/v1/posts/${postId}/schedule`, {
      channelId,
      // The input is local time; the API and the database speak UTC.
      scheduledAt: new Date(when).toISOString(),
    });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('scheduled'));
    await reload();
  };

  const publish = async () => {
    setBusy('publish');
    const result = await apiPost(`/api/v1/posts/${postId}/publish-now`, { channelId });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    // The worker does the posting, so this is honest about what just happened.
    toast.success(t('queued'));
    await reload();
  };

  const cancel = async (publicationId: string) => {
    const result = await apiDelete(`/api/v1/publications/${publicationId}`);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('cancelled'));
    await reload();
  };

  const retry = async (publicationId: string) => {
    const result = await apiPost(`/api/v1/publications/${publicationId}/retry`, {});
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('retried'));
    await reload();
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="size-4" aria-hidden />
        {t('title')}
      </h3>

      {publications.length > 0 ? (
        <ul className="space-y-2">
          {publications.map((publication) => (
            <li key={publication.id} className="rounded-lg border border-border bg-muted/40 p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{publication.channelName}</span>
                <span className="text-muted-foreground">
                  {new Date(publication.scheduledAt).toLocaleString()}
                </span>
                <span className="ml-auto text-xs font-medium">
                  {t(`status.${publication.status}`)}
                </span>
              </div>

              {publication.failureMessage ? (
                <p className="mt-1 text-xs text-destructive">{publication.failureMessage}</p>
              ) : null}

              <div className="mt-2 flex gap-2">
                {publication.externalUrl ? (
                  <Button asChild variant="ghost" size="sm" className="h-8">
                    <Link href={publication.externalUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" aria-hidden />
                      {t('viewOnFacebook')}
                    </Link>
                  </Button>
                ) : null}
                {publication.status === 'scheduled' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => cancel(publication.id)}
                  >
                    <X className="size-3.5" aria-hidden />
                    {t('cancel')}
                  </Button>
                ) : null}
                {publication.status === 'failed' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => retry(publication.id)}
                  >
                    {t('tryAgain')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('noChannels')}{' '}
          <Link href="/channels" className="underline hover:text-foreground">
            {t('connectAPage')}
          </Link>
        </p>
      ) : status !== 'approved' ? (
        <p className="text-sm text-muted-foreground">{t('approveFirst')}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="schedule-channel" className="text-xs">
                {t('pageLabel')}
              </Label>
              <select
                id="schedule-channel"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {active.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-44 flex-1 space-y-1">
              <Label htmlFor="schedule-when" className="text-xs">
                {t('whenLabel')}
              </Label>
              <Input
                id="schedule-when"
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                className="h-10 rounded-lg px-3"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="h-9" onClick={schedule} disabled={busy !== null}>
              <CalendarClock className="size-3.5" aria-hidden />
              {busy === 'schedule' ? t('scheduling') : t('schedule')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={publish}
              disabled={busy !== null}
            >
              <Send className="size-3.5" aria-hidden />
              {busy === 'publish' ? t('publishing') : t('publishNow')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
