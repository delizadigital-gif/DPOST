'use client';

import { useTranslations } from 'next-intl';
import { Globe, ImageIcon, MessageCircle, Share2, ThumbsUp } from 'lucide-react';

/**
 * How the post will read in a feed: the same text, the same line breaks, the
 * same "See more" cut-off. It is our own rendering, not a copy of Facebook's
 * interface — the point is to show the writing, not to imitate a product.
 */

const SEE_MORE_AT = 480;

export function PostPreview({
  pageName,
  body,
  hashtags,
  cta,
  needsImage,
  imageUrls = [],
}: {
  pageName: string;
  body: string;
  hashtags: string[];
  cta: string | null;
  needsImage?: boolean;
  /** Attached images, in the order they will appear. */
  imageUrls?: string[];
}) {
  const t = useTranslations('composer.preview');
  const text = [body.trim(), cta?.trim()].filter(Boolean).join('\n\n');
  const tags = hashtags.map((tag) => `#${tag}`).join(' ');
  const full = [text, tags].filter(Boolean).join('\n\n');
  const clipped = full.length > SEE_MORE_AT;
  const shown = clipped ? full.slice(0, SEE_MORE_AT) : full;
  const initial = pageName.trim().charAt(0).toUpperCase() || 'D';

  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card">
      <figcaption className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-spark text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{pageName}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {t('justNow')}
            <Globe className="size-3" aria-hidden />
          </span>
        </span>
      </figcaption>

      <div className="px-4 py-3">
        {full ? (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {shown}
            {clipped ? (
              <>
                … <span className="text-muted-foreground">{t('seeMore')}</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[15px] text-muted-foreground italic">{t('empty')}</p>
        )}
      </div>

      {imageUrls.length > 0 ? (
        <div
          className={`mx-4 mb-3 grid gap-1 ${imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {imageUrls.slice(0, 4).map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className="aspect-square w-full rounded-lg border border-border object-cover"
            />
          ))}
        </div>
      ) : null}

      {needsImage ? (
        <div className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground">
          <ImageIcon className="size-4" aria-hidden />
          {t('imageSuggested')}
        </div>
      ) : null}

      <div
        aria-hidden
        className="flex items-center justify-around border-t border-border px-4 py-2 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <ThumbsUp className="size-4" /> {t('like')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-4" /> {t('comment')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Share2 className="size-4" /> {t('share')}
        </span>
      </div>
    </figure>
  );
}
