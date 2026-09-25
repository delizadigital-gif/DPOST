import { useTranslations } from 'next-intl';
import { MessageCircle, Package, PieChart, Settings2, Store, Users } from 'lucide-react';
import type { BrandSectionName, BrandSource } from '@dpost/core/brand';
import { ProvenanceTag } from './provenance';
import { SectionDialog } from './section-dialog';
import { isPillarList, SECTION_FIELDS, type FieldConfig, type Pillar } from '@/lib/brand-fields';

/**
 * One card of the Brand Brain. Values are shown the way they'll be used —
 * a list stays a list, a choice shows its label — and each one is tagged
 * with where it came from.
 */

const ICONS = {
  business: Store,
  offerings: Package,
  audience: Users,
  voice: MessageCircle,
  contentMix: PieChart,
  preferences: Settings2,
} as const;

export interface SectionField {
  key: string;
  value: unknown;
  source: BrandSource;
}

export function SectionCard({
  section,
  fields,
}: {
  section: BrandSectionName;
  fields: SectionField[];
}) {
  const t = useTranslations('brand');
  const Icon = ICONS[section];
  const configs = SECTION_FIELDS[section];
  const values = Object.fromEntries(fields.map((field) => [field.key, field.value]));
  const bySource = new Map(fields.map((field) => [field.key, field.source]));
  const answered = fields.length;

  return (
    <section
      aria-labelledby={`brand-${section}`}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`brand-${section}`} className="font-sans text-[15px] font-semibold">
            {t(`sections.${section}.title`)}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('fieldsFilled', { filled: answered, total: configs.length })}
          </p>
        </div>
        <SectionDialog section={section} values={values} />
      </div>

      <dl className="mt-4 space-y-3 border-t border-border pt-4">
        {configs.map((config) => (
          <FieldRow
            key={config.key}
            section={section}
            config={config}
            value={values[config.key]}
            source={bySource.get(config.key)}
          />
        ))}
      </dl>
    </section>
  );
}

function FieldRow({
  section,
  config,
  value,
  source,
}: {
  section: BrandSectionName;
  config: FieldConfig;
  value: unknown;
  source: BrandSource | undefined;
}) {
  const t = useTranslations('brand');

  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {t(`fields.${section}.${config.key}`)}
      </dt>
      <dd className="flex flex-wrap items-start gap-2 text-sm">
        {source ? (
          <>
            <span className="min-w-0 flex-1">
              <FieldValue config={config} value={value} />
            </span>
            <ProvenanceTag source={source} />
          </>
        ) : (
          <span className="text-muted-foreground italic">{t('notSet')}</span>
        )}
      </dd>
    </div>
  );
}

function FieldValue({ config, value }: { config: FieldConfig; value: unknown }) {
  const options = useTranslations('options');

  if (config.kind === 'tags' && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <span key={String(item)} className="rounded-md bg-accent px-2 py-0.5 text-[13px]">
            {String(item)}
          </span>
        ))}
      </span>
    );
  }

  if (config.kind === 'choice' && typeof value === 'string') {
    return <span>{options(`${config.optionSet}.${value}`)}</span>;
  }

  if (config.kind === 'multi' && Array.isArray(value)) {
    return <span>{value.map((item) => options(`${config.optionSet}.${item}`)).join(', ')}</span>;
  }

  if (config.kind === 'pillars' && isPillarList(value)) {
    return <PillarBar pillars={value} />;
  }

  return <span className="break-words whitespace-pre-line">{String(value ?? '')}</span>;
}

const PILLAR_COLORS = ['bg-brand-600', 'bg-mint', 'bg-coral', 'bg-amber', 'bg-brand-300'];

/** The content mix as a single bar: the shape of a month at a glance. */
function PillarBar({ pillars }: { pillars: Pillar[] }) {
  const usable = pillars.filter((pillar) => pillar.weight > 0);
  const total = usable.reduce((sum, pillar) => sum + pillar.weight, 0);
  if (total === 0) return null;

  return (
    <span className="block space-y-2">
      <span className="flex h-2 overflow-hidden rounded-full">
        {usable.map((pillar, index) => (
          <span
            key={pillar.name}
            className={PILLAR_COLORS[index % PILLAR_COLORS.length]}
            style={{ width: `${(pillar.weight / total) * 100}%` }}
          />
        ))}
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {usable.map((pillar, index) => (
          <span key={pillar.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`size-2 rounded-full ${PILLAR_COLORS[index % PILLAR_COLORS.length]}`}
            />
            {pillar.name} {Math.round((pillar.weight / total) * 100)}%
          </span>
        ))}
      </span>
    </span>
  );
}
