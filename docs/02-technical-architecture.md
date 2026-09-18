# 02 — Technical Architecture (Part 4)

## 4.1 Stack decisions

Each choice lists the alternative I rejected and why.

| Layer              | Choice                                                                                                                          | Rejected alternative                       | Reason                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language           | **TypeScript (strict)** everywhere                                                                                              | —                                          | One language for UI, API, worker and AI tools. Zod schemas are shared between client validation, server validation and LLM tool schemas.                                                                                                                                                                                                   |
| Web framework      | **Next.js 15+ (App Router)**                                                                                                    | Remix; separate SPA + Express              | RSC gives fast dashboard loads without a client data layer. Route handlers cover REST and webhooks. Marketing pages get static generation. One deploy.                                                                                                                                                                                     |
| UI kit             | **Tailwind CSS v4 + shadcn/ui (Radix primitives)**                                                                              | MUI, Chakra                                | We _own_ the component source, so we can restyle to our own visual language rather than looking like a template. Radix gives accessibility (focus, ARIA, keyboard) for free.                                                                                                                                                               |
| Animation          | **Motion** (formerly Framer Motion), used sparingly                                                                             | GSAP                                       | Declarative, React-native, good layout/page transitions. GSAP is overkill for subtle UI motion.                                                                                                                                                                                                                                            |
| Forms              | **react-hook-form + zod**                                                                                                       | Formik                                     | Smaller, faster, and zod schemas are reused server-side.                                                                                                                                                                                                                                                                                   |
| Client data        | **TanStack Query** (only for interactive client islands: calendar, chat, media grid)                                            | SWR, Redux                                 | Cache invalidation after mutations (e.g. "AI changed 5 posts → refresh calendar"). Everything else stays RSC.                                                                                                                                                                                                                              |
| Calendar           | **Custom grid built on date-fns** (+ `@dnd-kit` post-MVP)                                                                       | FullCalendar                               | FullCalendar's premium features are paid and it's hard to style to our design. Month/week/list grids are ~400 lines we fully control.                                                                                                                                                                                                      |
| Database           | **PostgreSQL 16**                                                                                                               | MySQL, MongoDB                             | Relational integrity across tenants → accounts → posts → schedules. JSONB for flexible AI output (strategies, profiles). `pgvector` available later for semantic dedupe.                                                                                                                                                                   |
| ORM                | **Prisma**                                                                                                                      | Drizzle                                    | Single declarative schema, excellent migrations, Studio for debugging. Drizzle is lighter, but Prisma's DX wins for a solo developer. Raw SQL escape hatch via `$queryRaw` (parameterized) for analytics rollups.                                                                                                                          |
| Auth               | **Better Auth**                                                                                                                 | Auth.js v5, Clerk, Supabase Auth           | TS-first. Email+password with verification and reset built in. Organization plugin maps to workspaces. Sessions stored in _our_ Postgres. No per-MAU pricing (matters for a low-ARPU Bangladeshi market). Auth.js v5 is weaker on email/password flows. Clerk is costly at scale and separates user data from ours.                        |
| Password hashing   | **Argon2id** (Better Auth supports custom hashers; scrypt is its default and also acceptable)                                   | bcrypt                                     | Memory-hard, current OWASP recommendation.                                                                                                                                                                                                                                                                                                 |
| Queue              | **BullMQ on Redis**                                                                                                             | Inngest, Trigger.dev, pg-boss, Vercel Cron | Durable delayed jobs to the second, retries with exponential backoff, per-queue concurrency, rate-limited queues (useful for Meta limits), repeatable jobs. We need a long-running worker anyway. Inngest is excellent but adds per-step cost and vendor dependency. pg-boss is a valid lighter alternative if we want to drop Redis.      |
| Cache / rate limit | **Redis** (same instance)                                                                                                       | In-memory                                  | Survives restarts, shared between web and worker.                                                                                                                                                                                                                                                                                          |
| Object storage     | **Cloudflare R2**                                                                                                               | AWS S3, Supabase Storage                   | S3 API compatible (swap anytime), **zero egress fees**, CDN via Cloudflare.                                                                                                                                                                                                                                                                |
| Image processing   | **sharp** + **satori/resvg** for text overlays                                                                                  | Canvas                                     | sharp handles resize/convert/strip EXIF. satori renders JSX → SVG with custom fonts, so Bangla text overlays come out perfect.                                                                                                                                                                                                             |
| LLM                | **Anthropic Claude** as the default adapter behind `LLMProvider`                                                                | Hard-coding one SDK                        | Strong structured output, tool use and multilingual (Bangla) quality. The abstraction allows OpenAI/Gemini adapters for cost or fallback. Model IDs come from env, never code.                                                                                                                                                             |
| Image gen          | **`ImageProvider` interface** with one adapter at launch (e.g. OpenAI `gpt-image`, Google Imagen, or Flux via fal.ai/Replicate) | —                                          | Pick the default on price and quality in Phase 9 with a bake-off on real BD business prompts. The interface is identical either way.                                                                                                                                                                                                       |
| Email              | **Resend** + React Email                                                                                                        | SES, SendGrid                              | Simple API, React templates, good deliverability. SES later if cost matters.                                                                                                                                                                                                                                                               |
| i18n               | **next-intl**                                                                                                                   | react-i18next                              | Built for the App Router and RSC, with ICU messages (Bangla plurals, numbers).                                                                                                                                                                                                                                                             |
| Validation         | **zod**                                                                                                                         | yup, valibot                               | Also generates JSON Schema for LLM tools (`z.toJSONSchema`).                                                                                                                                                                                                                                                                               |
| Logging            | **pino** (JSON) + **Sentry**                                                                                                    | console                                    | Structured logs with `requestId`/`workspaceId`/`jobId`. Sentry for exceptions in web and worker.                                                                                                                                                                                                                                           |
| Testing            | **Vitest**, **Playwright**, **MSW**, Testcontainers (Postgres/Redis)                                                            | Jest                                       | Fast, ESM-native. MSW mocks Meta and LLM HTTP calls deterministically.                                                                                                                                                                                                                                                                     |
| Monorepo           | **pnpm workspaces** (no Turborepo at first)                                                                                     | Nx, Turborepo                              | Three packages don't need a build orchestrator. Add Turborepo when builds get slow.                                                                                                                                                                                                                                                        |
| Hosting            | **Railway** (web + worker + Postgres + Redis), **Cloudflare** (DNS, R2, CDN)                                                    | Vercel + Neon + Upstash; AWS               | One platform runs a long-lived worker next to the web app with private networking to Postgres/Redis, predictable pricing, and easy preview environments. Vercel can't run the BullMQ worker. AWS is too much ops for one developer. **Portable**: everything is Dockerfile-based, so moving to Fly.io/Render/AWS later is a config change. |
| Payments (later)   | **`PaymentProvider` interface** → SSLCommerz (BD: bKash, Nagad, Rocket, cards) + Stripe (international)                         | Stripe only                                | Stripe doesn't onboard Bangladesh-registered merchants directly. Local customers pay via MFS wallets.                                                                                                                                                                                                                                      |

> **Region note:** there's no Bangladesh cloud region on these providers. Singapore (`ap-southeast-1`-class) gives the best latency to Dhaka (~40–60 ms). Put the app, DB and Redis in the **same region**. Cross-region DB calls would dominate response times.

## 4.2 Repository layout

```
dpost/
├─ apps/
│  ├─ web/                    # Next.js (marketing + dashboard + API + chat)
│  │  ├─ src/app/
│  │  │  ├─ (marketing)/      # /, /pricing, /privacy, /terms
│  │  │  ├─ (auth)/           # /login, /signup, /verify, /forgot, /reset
│  │  │  ├─ (app)/            # authenticated dashboard (layout = sidebar shell)
│  │  │  ├─ admin/            # platform admin
│  │  │  └─ api/              # route handlers: v1/*, auth/*, oauth/*, webhooks/*, chat
│  │  ├─ src/components/      # ui/ (shadcn), app/ (feature components), marketing/
│  │  ├─ src/lib/             # client helpers, query keys, formatters
│  │  └─ messages/            # next-intl: en.json (bn.json post-MVP)
│  └─ worker/                 # BullMQ workers + schedulers (plain Node)
│     └─ src/{queues,processors,index.ts}
├─ packages/
│  ├─ core/                   # ALL business logic (framework-agnostic)
│  │  └─ src/
│  │     ├─ services/         # content, scheduling, brand, media, social, ...
│  │     ├─ ai/               # providers/, prompts/, pipelines/, usage.ts
│  │     ├─ agent/            # tools/, registry.ts, runner.ts, confirm.ts
│  │     ├─ social/           # adapters/facebook/, types.ts
│  │     ├─ authz/            # policies, tenant guard, roles
│  │     ├─ jobs/             # queue names, payload schemas, enqueue helpers
│  │     ├─ lib/              # crypto, errors, logger, rate-limit, time
│  │     └─ schemas/          # shared zod schemas
│  ├─ db/                     # prisma/schema.prisma, migrations, client, seed
│  └─ config/                 # env validation (zod), eslint, tsconfig bases
├─ docs/                      # this blueprint
├─ docker-compose.yml         # local Postgres + Redis + MinIO (S3) + Mailpit
└─ .env.example
```

**Why `core` is a separate package:** it makes it _physically impossible_ for business logic to import from Next.js (`next/headers`, etc.), so the worker, tests and a future MCP server can use it unchanged.

## 4.3 Request lifecycle (web)

```
Request
  → middleware.ts          (session cookie present? locale? rate-limit bucket by IP)
  → route handler / server action / RSC
      → getContext()       (resolve session → user → active workspace → role)  ← one function, used everywhere
      → service.fn(ctx, input)
            → authorize(ctx, "post:update", resource)   ← policy check
            → zod.parse(input)
            → db (tenant-guarded Prisma client: workspaceId required)
            → audit.log(...) for mutations
      → typed Result<T, AppError>
  → response mapper        (AppError → HTTP status + user-safe message; never a stack trace)
```

`ctx` (`{ userId, workspaceId, role, requestId, source: 'web'|'api'|'agent'|'worker' }`) is the first argument of **every** service function. The agent and worker build the same `ctx`, so authorization is identical across all entry points.

## 4.4 Multi-tenancy & isolation

- **Model:** shared database with a `workspace_id` column on every tenant-scoped table. Schema-per-tenant is operationally heavy and unnecessary at this scale.
- **Enforcement layer 1, the service layer:** every read and write goes through services that take `ctx.workspaceId`.
- **Enforcement layer 2, the tenant-guarded Prisma client:** a Prisma client extension that, for tenant-scoped models, **throws** if a query's `where` lacks `workspaceId`, and auto-injects `workspaceId` on `create`. A forgotten filter becomes a crash in tests instead of a data leak in production.
- **Enforcement layer 3, tests:** an isolation test suite creates two workspaces and asserts that every service and every API route and AI tool from workspace A returns 404 for workspace B's IDs. We return 404 rather than 403 so we don't confirm existence.
- **IDs:** `cuid2`/UUIDv7 (non-sequential, so no enumeration).
- **Postgres RLS:** deferred. It's a valid defense-in-depth layer but awkward with Prisma connection pooling. Revisit if we add direct SQL consumers.

## 4.5 Authentication

| Concern            | Implementation                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sessions           | Better Auth DB sessions, `HttpOnly`, `Secure`, `SameSite=Lax` cookies, rotation on privilege change, 30-day sliding expiry                 |
| Passwords          | Argon2id, min 8 chars, checked against a breached-password list (HIBP k-anonymity, optional)                                               |
| Email verification | Required before connecting social accounts or publishing                                                                                   |
| Reset              | Single-use token, 30-min TTL, all sessions revoked on reset                                                                                |
| Brute force        | Redis rate limits: 5 login attempts / 15 min per email+IP, with progressive delay                                                          |
| OAuth sign-in      | Google (MVP). _Not_ Facebook login, which is deliberately separate from the Facebook **connection** (see [08](08-facebook-integration.md)) |
| CSRF               | SameSite cookies + Origin header check on all mutating route handlers. Server Actions have built-in origin checks                          |
| Admin              | `users.platform_role = 'admin'`, plus admin routes require re-auth within 12 h (2FA post-MVP)                                              |

## 4.6 Social integration layer

```ts
// packages/core/src/social/types.ts (shape only)
interface SocialPlatformAdapter {
  platform: 'facebook' | 'instagram' | ...;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<ConnectedIdentity>;      // user + pages + tokens
  refreshOrValidate(account): Promise<TokenHealth>;
  listTargets(account): Promise<PublishTarget[]>;              // Pages / IG accounts
  validatePost(post: DraftPost): ValidationIssue[];            // length, media count/type/size
  publish(target, post: PublishablePost): Promise<PublishResult>;
  fetchRecentPosts(target, opts): Promise<ExternalPost[]>;     // for brand analysis
  fetchInsights(target, externalIds): Promise<InsightSnapshot[]>;
  capabilities: PlatformCapabilities;                           // drives UI (e.g. "polls unsupported")
}
```

**Why `capabilities`:** the UI and AI read `capabilities` instead of hard-coding "Facebook can do X". When Instagram arrives, the composer and the AI automatically know which features it supports (for example, no link posts and required media).

Tokens are **encrypted at rest** with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, 32 bytes, from env), stored as `ciphertext`, `iv`, `auth_tag` and `key_version` for rotation. They are decrypted only inside the worker/service at call time, **never** sent to the browser and never logged. Logger redaction paths include `*.accessToken`, `*.token` and `authorization`.

## 4.7 Queue & background jobs

| Queue           | Trigger                            | Concurrency                  | Retry policy                                                                                               | On final failure                                                          |
| --------------- | ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `publish`       | Delayed job at `scheduled_at`      | 5                            | 3 attempts, exponential (1 m, 5 m, 15 m). **No retry** on permanent errors (invalid token, content policy) | Post → `failed`, notification + email, reason stored                      |
| `ai-plan`       | User/agent request                 | 3                            | 2 attempts per batch, and partial success is kept                                                          | Plan → `partially_generated` / `failed`, notify                           |
| `ai-image`      | Per post / request                 | 3                            | 2 attempts                                                                                                 | Media → `failed`, notify                                                  |
| `sync-page`     | After connect, then daily          | 2                            | 3 attempts                                                                                                 | Log + surface on account card                                             |
| `analyze-brand` | After first `sync-page`, on demand | 2                            | 2 attempts                                                                                                 | Keep the onboarding-only profile, notify                                  |
| `sync-insights` | Repeatable every 6 h               | 2, **rate-limited** per Page | 3 attempts                                                                                                 | Silent retry next cycle, alert if failing for 24 h                        |
| `token-health`  | Repeatable daily                   | 2                            | —                                                                                                          | Account → `needs_reconnect`, notify + email                               |
| `notify`        | Events                             | 10                           | 5 attempts                                                                                                 | Dead-letter                                                               |
| `reconcile`     | Repeatable every 5 min             | 1                            | —                                                                                                          | Re-enqueue schedules that are due but have no job (Redis loss protection) |

**Critical design points:**

1. **Postgres is the source of truth. Redis only holds the job.** `schedules.status` and `scheduled_at` live in Postgres. The `reconcile` sweeper finds `scheduled` rows past due with no active job and re-enqueues them, so a Redis flush can delay a post but never lose it.
2. **Idempotent publishing.** Before calling Meta, the worker atomically transitions `scheduled → publishing` (conditional `UPDATE ... WHERE status='scheduled'`). If that affects 0 rows, another worker got it and we exit. After success we store `external_post_id` immediately. A crash between the Meta call and the DB write is the one unavoidable edge. On retry, if `publishing` has been stuck for more than 10 min, we check the Page's recent posts for a matching marker before re-posting, to avoid duplicates.
3. **Rescheduling** removes the old delayed job by deterministic `jobId = schedule:{id}:{version}` and enqueues a new one.
4. **Error classification** in the Facebook adapter maps Graph error codes into `TRANSIENT` (retry), `RATE_LIMITED` (retry after header/backoff), `AUTH` (no retry → reconnect) and `PERMANENT` (no retry → show reason).

## 4.8 Storage & media pipeline

```
Upload:  browser ──(1) request presigned PUT──► API (validates type/size/quota)
         browser ──(2) PUT file directly──────► R2  /tmp/{workspaceId}/{uuid}
         browser ──(3) confirm──────────────────► API → enqueue `media-process`
         worker: sniff magic bytes (not the extension), sharp: strip EXIF, re-encode,
                 generate thumb (400px) + display (1600px), move to /ws/{workspaceId}/media/{id}/
AI image: worker → ImageProvider → bytes → same processing → media_asset(source='ai')
Serve:   private bucket; signed GET URLs (1 h) or Cloudflare Worker with signed-token check
```

- **Why presigned uploads:** large files never pass through our server, so no memory spikes and no request timeouts.
- **Why re-encode:** it neutralizes polyglot files and malicious metadata. We never serve user files with a user-controlled `Content-Type`.
- **Allowed MVP types:** JPEG, PNG, WebP (images, ≤ 10 MB). Video is post-MVP.
- **For publishing,** the worker gives Meta a short-lived signed URL (or uploads bytes directly) so Meta can fetch the image.

## 4.9 Billing foundation

- Tables: `plans` (seeded config), `subscriptions` (workspace → plan, status, period), `usage_counters` (workspace, metric, period, count).
- **Entitlement check** `billing.assertCanUse(ctx, 'ai_generation', n)` is called by services before costly work. Limits come from `plans.limits` JSON, so changing a limit needs no deploy.
- MVP: everyone starts on **Free**. Admins can assign plans manually, so you can hand-sell to early customers via bKash invoice and flip them to Starter in `/admin`.
- `PaymentProvider` interface (`createCheckout`, `handleWebhook`, `cancel`) is defined now but implemented post-MVP.
- **Pricing in BDT**, stored as integer poisha (1 BDT = 100 poisha) with a `currency` column. Never store money as floats.

| Plan     | AI posts / mo | AI images / mo | Scheduled posts / mo |                Pages | Members |
| -------- | ------------: | -------------: | -------------------: | -------------------: | ------: |
| Free     |            30 |              5 |                   30 |                    1 |       1 |
| Starter  |           300 |             50 |                  300 |                    3 |       1 |
| Business |         1,500 |            200 |                1,500 |                   10 |       3 |
| Agency   |         5,000 |            600 |            unlimited | 30 (multi-workspace) |      10 |

_(Numbers are placeholders to tune against your real AI cost per post. See the cost note in [05](05-ai-architecture.md).)_

## 4.10 Analytics architecture

- `post_metrics` stores **snapshots** (`post_id`, `captured_at`, `metrics JSONB`), not overwrites, so we can chart growth curves and only ever display metrics that actually came back from the API.
- `page_metrics_daily` holds Page-level daily values.
- `metrics` is JSONB keyed by a **normalized metric vocabulary** (`reactions`, `comments`, `shares`, `impressions`, `reach`, `clicks`) plus a `raw` object. Each adapter maps its platform's names into this vocabulary. A missing key means "not available", and the UI shows "—" with a tooltip rather than 0.
- Rollups ("best content type", "best hour") are SQL queries over the last 90 days, cached in Redis for 1 h.

## 4.11 Observability & operations

- A `requestId`/`jobId` on every log line, with `workspaceId` where known.
- Health endpoints: `/api/health` (web), plus a worker heartbeat key in Redis that the admin panel reads.
- BullMQ dashboard (bull-board) mounted under `/admin/queues`, admin-only.
- Sentry for web + worker, with PII scrubbing enabled.
- Uptime ping on the health endpoint.

## 4.12 Environment variables (initial list)

```bash
# App
APP_URL=                    # https://app.example.com
NODE_ENV=
# Database / cache
DATABASE_URL=
REDIS_URL=
# Auth
BETTER_AUTH_SECRET=         # 32+ random bytes
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Crypto
TOKEN_ENCRYPTION_KEY=       # 32 bytes base64; for social tokens
TOKEN_ENCRYPTION_KEY_VERSION=1
CONFIRMATION_TOKEN_SECRET=  # HMAC key for AI action confirmations
# Meta
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=         # e.g. v23.0; pin explicitly, upgrade deliberately
META_WEBHOOK_VERIFY_TOKEN=
# AI
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
LLM_MODEL_SMART=            # generation / agent
LLM_MODEL_FAST=             # classification / cheap tasks
IMAGE_PROVIDER=
IMAGE_PROVIDER_API_KEY=
# Storage
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# Email
RESEND_API_KEY=
EMAIL_FROM=
# Observability
SENTRY_DSN=
```

All of these are validated at boot with a zod schema in `packages/config`. The app **refuses to start** with a missing or malformed secret, instead of failing at 2 a.m. on the first publish. Only variables prefixed `NEXT_PUBLIC_` reach the browser, and none of the above are.
