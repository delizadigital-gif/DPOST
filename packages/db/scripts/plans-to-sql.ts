/**
 * Prints the plan catalogue as SQL, for environments that have no Node
 * toolchain at release time (the production image runs it with
 * `prisma db execute`). `plans.ts` stays the single source of truth.
 *
 * Existing rows are left untouched: limits can be tuned in the database
 * without a deploy, and a release must not silently reset them.
 */
import { PLAN_CATALOGUE } from '../src/plans';

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`;

const rows = PLAN_CATALOGUE.map(
  (plan) =>
    `  (${quote(plan.id)}, ${quote(plan.name)}, ${json(plan.limits)}, '{}'::jsonb, ${json(plan.prices)}, true, ${plan.sortOrder})`,
).join(',\n');

process.stdout.write(
  `-- Generated from packages/db/src/plans.ts. Do not edit by hand.\n` +
    `INSERT INTO plans (id, name, limits, features, prices, "isPublic", "sortOrder") VALUES\n` +
    `${rows}\n` +
    `ON CONFLICT (id) DO NOTHING;\n`,
);
