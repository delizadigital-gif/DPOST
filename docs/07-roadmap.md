# 07 — Development Roadmap (Part 9) & MVP Definition (Part 10)

## 9.0 How the sequence was chosen

I reordered your proposed 21 phases around three rules:

1. **Deploy a skeleton in week 1 and keep it runnable.** Every phase ends with a working, deployed staging app.
2. **Reach the core loop (Create → Schedule → Publish to a real Page) as early as possible.** It's the riskiest integration and the whole value proposition. Everything after it is an enhancement of a working product.
3. **Start Meta Business Verification + App Review the moment the publish flow works**, because it's a multi-week external wait that should run _in parallel_ with Phases 9–13.

Changes from your list: security and testing are **built into every phase**, not saved for the end (they're too important to back-load). The landing page moves late, except for a minimal public site + legal pages, which Meta needs early. Page analysis moves after generation, because onboarding answers already make generation useful, so analysis is an enhancement.

Estimated durations assume one developer working with Claude, full-time. Treat them as planning ranges, not promises.

```
Wk  1    2    3    4    5    6    7    8    9    10   11   12   13   14
P0 ▓
P1 ▓▓▓
P2    ▓▓▓
P3       ▓▓▓▓
P4           ▓▓▓
P5              ▓▓▓
P6                 ▓▓▓▓▓
P7                      ▓▓▓▓▓
P8                           ▓▓▓▓▓▓▓▓      ◄ CORE LOOP LIVE on staging
Meta verification & App Review ···▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (parallel, external)
P9                                   ▓▓▓▓
P10                                      ▓▓▓▓▓
P11                                           ▓▓▓▓▓▓
P12                                                 ▓▓▓
P13                                                    ▓▓▓
P14                                                       ▓▓▓▓
P15                                                           ▓▓▓
P16                                                              ▓▓▓▓
P17                                                                  ▓▓▓ ◄ closed beta → public
```

---

## Phase 0 — Accounts, credentials & legal groundwork (non-code, ~2–3 days)

**Goal:** remove external blockers before they block.

- [ ] Register a domain. Set up Cloudflare DNS.
- [ ] **Apply for a trade license for DelizaDigital** (sole proprietorship) and an e-TIN. This is required for Meta Business Verification; see [08 §4.1](08-facebook-integration.md#41-business-verification-plan-for-delizadigital-no-trade-license-yet). It doesn't block Phases 1–8.
- [ ] Create a **Meta Business Portfolio** for DelizaDigital (business.facebook.com). Submit Business Verification once the trade license arrives.
- [ ] Check that the **DPOST** name is clear: domain availability (e.g. `dpost.app`, `dpost.com.bd`, `getdpost.com`), existing apps or brands with the same name in BD, and Facebook Page and Instagram handle availability.
- [ ] Create a Meta app (type: **Business**) → note `META_APP_ID` / `META_APP_SECRET` and add yourself as admin. Create a **test Facebook Page** you own.
- [ ] Anthropic API key (and an optional second LLM provider for fallback testing), and an image provider key.
- [ ] Accounts: Railway, Cloudflare (R2), Resend (verify the sending domain), Sentry, GitHub.
- [ ] Draft the Privacy Policy, Terms and Data Deletion instructions (templates + lawyer review before public launch).
- [x] Git installed (2.55.0).
- [x] pnpm 12 installed (Phase 1).
- [ ] Install **Docker Desktop** before Phase 2 (local Postgres, Redis, S3 and email).

**Definition of done:** all credentials are listed in a password manager, and Business Verification is submitted.

---

## Phase 1 — Project foundation (~3 days)

**Goal:** a runnable, deployed, empty monorepo with guardrails.

- **Features:** pnpm monorepo; Next.js app with Tailwind v4 + shadcn/ui initialized with our tokens and fonts; worker app stub; `packages/core`, `packages/db`, `packages/config`; env validation; logger; error types; `docker-compose` (Postgres, Redis, MinIO, Mailpit); ESLint + Prettier + strict tsconfig; Vitest + Playwright configured; GitHub Actions CI (typecheck, lint, test); Railway staging deploy (web + worker + PG + Redis); `/api/health`.
- **Files:** `pnpm-workspace.yaml`, `apps/web/*`, `apps/worker/src/index.ts`, `packages/config/env.ts`, `packages/core/src/lib/{logger,errors,result}.ts`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `Dockerfile.web`, `Dockerfile.worker`.
- **DB:** none yet (Prisma initialized).
- **Dependencies:** next, react, tailwindcss, shadcn/ui, zod, pino, vitest, playwright, @sentry/nextjs.
- **Testing:** env schema tests, health route test, one Playwright smoke test (home renders).
- **Done when:** `pnpm dev` runs everything locally from one command, the CI is green and staging URL serves a page, with the worker logging a heartbeat.

> **Status (2026-09-19): built and verified locally.** Differences from the plan:
>
> - `Result<T, E>` was dropped. Services throw `AppError` and one mapper (`toPublicError`) converts errors at the edge, which is less ceremony.
> - `packages/db` (Prisma) moves to Phase 2, where the database is actually used.
> - Sentry is wired up at the first deploy, because it needs your account and DSN.
> - Next.js is version 16: Turbopack is the default bundler, and route protection uses `proxy.ts` rather than `middleware.ts` (relevant for Phase 3).
>
> **Deployment (done 2026-09-25):** staging is live at https://web-production-6737e.up.railway.app, with `web`, `worker`, Postgres and Redis on Railway in Singapore, defined in code in `.railway/railway.ts`. Migrations and plan seeding run automatically before each release. Verified live: health checks, all public pages, route protection, sign-up, workspace creation and login.
>
> Email is live through Resend. Two traps worth remembering: Railway blocks outbound SMTP ports 465 and 587 (use Resend’s port 2465, or a send silently hangs), and Resend delivers only to the account owner’s exact address until a domain is verified. Google sign-in is verified on the live site.
>
> Outstanding for production: a verified sending domain, security headers (Phase 16), Sentry, and Railway deploying automatically on push (today a deploy is triggered manually).

## Phase 2 — Database, tenancy & the service pattern (~3 days)

**Goal:** the skeleton that every feature plugs into.

- **Features:** full Prisma schema (from [03](03-database-schema.md)) + first migration; tenant-guarded Prisma client extension; `Context` type + `getContext()`; authz policy table (role → permissions); `route()` wrapper (auth, validation, rate limit, error mapping); Redis rate limiter; audit log service; token encryption util (AES-256-GCM) with tests; seed (plans).
- **Files:** `packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`, `packages/db/src/tenant-guard.ts`, `packages/core/src/authz/{policies,context}.ts`, `packages/core/src/lib/{crypto,rate-limit,audit}.ts`, `apps/web/src/lib/api/route.ts`.
- **Testing:** tenant guard throws without `workspaceId`; crypto round-trip + tamper detection; policy matrix tests; rate limiter tests (Testcontainers Redis).
- **Done when:** a sample `GET /api/v1/me` passes through the full wrapper, and isolation tests run in CI.

> **Status (2026-09-19): done and verified locally.** 164 tests pass (125 unit, 39 integration against real Postgres and Redis), plus 6 end-to-end tests against the production standalone build. The migration applies with no drift from the schema. Notes:
>
> - Prisma is pinned to **7.10.0**. npm's `latest` tag pointed at an 8.0 release candidate.
> - Local S3 storage (MinIO) was removed from `docker-compose.yml`, because MinIO no longer publishes Docker Hub images. A replacement is chosen in Phase 9.
> - The integration tests caught a real bug: the Redis client refused commands issued while it was still connecting, so the first requests after every boot failed. Fixed, with a regression test.
> - **Still open:** automatic migrations on deploy (set up at the first Railway deploy), and graceful worker shutdown, which Windows can't signal and gets verified in Docker or CI.

## Phase 3 — Authentication + minimal public site (~4 days)

**Goal:** real users can sign up securely, and Meta has URLs to review.

- **Features:** Better Auth (email+password with Argon2id, verification, reset, Google); sign-up creates workspace + owner membership + free subscription in one transaction; auth pages (designed, not placeholder); `proxy.ts` protecting `(app)` (Next 16 renamed middleware); logout; brute-force limits; React Email templates (verify, reset); a **minimal** marketing page + `/privacy`, `/terms`, `/data-deletion`.
- **Files:** `packages/core/src/auth/*`, `apps/web/src/app/(auth)/*`, `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/proxy.ts`, `packages/core/src/email/templates/*`, `apps/web/src/app/(marketing)/{page,privacy,terms,data-deletion}`.
- **Testing:** sign-up → verify → login E2E (Mailpit); reset flow; session revocation on reset; rate-limit lockout; protected route redirects; unverified user cannot reach publish endpoints.
- **Done when:** a new user can sign up on staging, receive a real email, verify, log in and log out, and legal pages are publicly reachable.

> **Status (2026-09-19): done and verified locally** (staging waits on the first Railway deploy). 199 unit and integration tests and 14 end-to-end tests pass. The end-to-end tests cover the real journey: sign up → real email in Mailpit → confirm → sign out → log in, plus password reset and the legal pages. Changes from the plan:
>
> - **Password hashing uses Better Auth's built-in scrypt, not Argon2id.** Both are memory-hard and OWASP-recommended; scrypt needs no native module, which keeps the Docker images and bundling simple.
> - **Emails are plain HTML/text template functions**, not React Email, and are sent over SMTP: Mailpit locally, Resend's SMTP interface in production. One code path, no extra dependencies.
> - **Unverified users can sign in.** Connecting Facebook and publishing will require a confirmed email (`assertEmailVerified`, used from Phase 8).
> - **Client IP is computed once**, from the rightmost `X-Forwarded-For` entry, and handed to Better Auth in a private header. The first entry, and Better Auth's default handling, could be spoofed to bypass per-IP rate limits. **Verify at the first deploy** that Railway adds exactly one proxy hop, and revisit this if a CDN is placed in front.
> - "Continue with Google" is verified with a real Google account. Better Auth stores Google's tokens in plain text by default, so `encryptOAuthTokens` is now on. Before production, **reset the Google client secret** (it was shared in chat during setup) and add the production domain to the OAuth client.
> - Auth forms submit with `method="post"`, so a submission before the page is interactive can never put a password in the URL.
> - The legal pages describe DPOST's actual data practices, but they still **need review by a lawyer before public launch**. `CONTACT_EMAIL` is required in production.

## Phase 4 — App shell & design system (~3 days)

**Goal:** the product _feels_ real, with correct empty states everywhere.

- **Features:** sidebar/mobile tab bar layout; all routes created with empty states; shared components (8.5 foundation set + StatusBadge, EmptyState, Skeleton patterns, SparkButton, QuotaMeter); theme tokens (light/dark); toasts; the `next-intl` setup with `en.json`; page transitions; notification bell (reads real table, empty).
- **Files:** `apps/web/src/app/(app)/layout.tsx`, `components/app/shell/*`, `components/ui/*`, `messages/en.json`, `styles/tokens.css`.
- **Testing:** Playwright visual smoke per route at 3 viewports; axe accessibility checks on the shell.
- **Done when:** every nav item leads to a designed page (empty state), and it's responsive at 375 / 768 / 1280.

> **Status (2026-09-25): done and verified locally.** 206 unit and integration tests, plus 35 end-to-end tests at three screen sizes. Every section loads with its own empty state, nothing scrolls sideways, and automated accessibility checks (axe, WCAG 2.1 AA) find no serious violations on the shell.
>
> - **Navigation is defined once** in `src/lib/navigation.ts`; the sidebar, the phone tab bar and the "More" sheet all read from it, and a test fails if a label has no translation.
> - **Every visible string lives in `messages/en.json`** through next-intl, so a Bangla interface later is translation work rather than code changes.
> - **Light and dark themes** via next-themes, following the system setting until the user chooses.
> - The sidebar shows the real plan and AI usage, and the bell reads real notifications (both empty until later phases).
> - Sign-out moved into the account menu, so the Phase 3 end-to-end test was updated to match.
> - Tablet tests run at 768px in Chrome rather than an iPad profile, which would mean downloading a second browser engine for one breakpoint.

## Phase 5 — Onboarding & Brand Brain (manual) (~3 days)

**Goal:** capture business context, the AI's raw material.

- **Features:** 4-step onboarding wizard (step 4 "Connect" shows "Coming next" until Phase 8, with a Skip option); Brand Brain page with section cards (editable, provenance tags); memories CRUD; zod schemas per brand section; `brand.version` bump; brand card renderer (pure function) with snapshot tests.
- **API:** `/onboarding/:step`, `/brand`, `/brand/:section`, `/brand/memories`.
- **Testing:** each section's validation; skip paths; brand card snapshot; isolation tests.
- **Done when:** a new user completes onboarding in under 3 minutes, and the Brand Brain shows and edits everything captured.

> **Status (2026-09-26): done and verified locally.** 269 unit and integration tests and 53 end-to-end tests at three screen sizes, including accessibility checks on both the wizard and the Brand Brain.
>
> - **The brand shapes live in one place** (`packages/core/src/brand/sections.ts`): onboarding, the Brand Brain screen and the REST API all validate against the same six zod schemas, and the edit dialog builds its form from the same field list.
> - **Every value carries its provenance** — _You_ · _From setup_ · _From your Page_ — and the rule that protects it: Page analysis (Phase 8) may fill a gap or correct itself, but never overwrites what a person typed. Tested both ways.
> - **The brand card is a pure function**, not an LLM call, so prompts can be cached against `brand.version` and a bad post can be traced to the exact text the model was given. The Brand Brain shows that text verbatim under "What the AI reads".
> - **Onboarding steps are Server Actions**, writing through the same service as `PATCH /api/v1/brand/:section` rather than a parallel `/onboarding/:step` endpoint — one validation path instead of two.
> - **Step 4 says Facebook publishing isn't built yet** instead of showing a button that pretends to connect.
> - **Only the business name is required.** Skipping is recorded as skipped, so nothing later claims the AI knows a business it doesn't.
> - `workspaces.onboardingCompletedAt` decides the redirect; an abandoned setup resumes at the first unanswered step.
> - A new account now lands in setup, so the "email confirmed" toast appears after setup rather than before it. The email-verification flow itself is unchanged.
> - Fixed along the way: `@dpost/core` needed a client-safe `/brand` subpath (importing the main entry from a client component pulled ioredis into the browser bundle), and unset fields used a translucent grey that failed the 4.5:1 contrast rule.

## Phase 6 — AI foundation & single-post generation (~5 days)

**Goal:** the first "wow". The AI writes on-brand posts in English, Bangla and Banglish.

- **Features:** `models.ts` (smart/fast); `withUsage` metering + `ai_usage_events`; quota enforcement (`billing.assertCanUse`); prompt modules (system, platform rules, post writer v1); quality gate (schema, length, language script check, banned phrases, duplicate check); `POST /ai/generate` (≤ 5 posts); **Composer** (full UI except scheduling): ✦ Write / Improve / Shorten / Translate / Hashtags / CTA, preview, save draft; Facebook `validatePost` rules as a pure module.
- **Dependencies:** `ai`, `@ai-sdk/anthropic`.
- **Testing:** prompts with a mocked LLM (MSW) → pipeline logic; quality-gate unit tests (duplicates, language detection); quota exceeded → 402; the golden-set script (manual run, real API) for 10 briefs.
- **Done when:** a user can generate 5 on-brand Bangla posts in the composer, edit one and save it as a draft, and usage appears in the DB.

## Phase 7 — Content management & calendar (~5 days)

**Goal:** see, review and organize all content.

- **Features:** posts CRUD service + API; revisions (edit/regenerate/restore); approve / bulk approve; duplicate; soft delete + undo toast; `/content` list with filters, search and bulk actions; `/calendar` Month / Week / List views with the post detail sheet; regenerate with instruction; status badges (derived).
- **Testing:** status machine unit tests (every allowed/forbidden transition); calendar range queries with timezone edge cases (a post at 23:30 Dhaka appears on the correct local day); isolation tests; E2E: generate → approve → see it on the calendar.
- **Done when:** a user can manage 100+ posts comfortably, with calendar render under 300 ms for a month.

## Phase 8 — Facebook connection, queue & publishing: the CORE LOOP (~8 days)

**Goal:** approved posts publish to a real Facebook Page on time, reliably.

- **Features:**
  - Meta OAuth (state in Redis, code exchange, long-lived token, `/me/accounts` for Pages + page tokens), page picker, encrypted token storage, Channels page, disconnect (revoke), reconnect.
  - `SocialPlatformAdapter` interface + Facebook adapter (`publish` text / link / single photo / multi-photo, error classification).
  - BullMQ queues + worker processors: `publish`, `token-health`, `reconcile`, `notify`.
  - Schedule / reschedule / unschedule / publish-now / retry; idempotent state transition; publish attempts log.
  - In-app notifications for published / failed / disconnected; email for failed + disconnected.
  - Meta webhooks: deauthorize + data deletion.
- **Files:** `core/social/adapters/facebook/{oauth,client,publish,errors,validate}.ts`, `core/services/scheduling.ts`, `apps/worker/src/processors/{publish,tokenHealth,reconcile,notify}.ts`, `apps/web/src/app/api/oauth/facebook/callback/route.ts`, `api/webhooks/meta/*`.
- **Testing (highest priority in the project):** adapter tests against recorded Graph API fixtures (MSW): success, expired token (190), permission error (200), rate limit (4/17/32/613), transient 5xx; worker tests: exactly-once transition under concurrent workers, retry schedule, permanent failure → no retry + notification, reschedule swaps job, reconcile re-enqueues lost jobs after Redis flush; token never present in any log line or API response (test asserts on log output); webhook signature verification; **one manual live test on your test Page** per release.
- **Done when:** 20 posts scheduled across a day on the test Page all publish within 60 s of their time; a revoked token turns the channel "Needs reconnect" with notification and email; killing the worker mid-run loses nothing.
- **➜ Then immediately:** record the App Review screencast and submit for `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `read_insights` (+ `pages_read_user_content` if needed for analysis). See [08](08-facebook-integration.md).

## Phase 9 — Media library & AI images (~4 days)

- **Features:** R2 presigned uploads; processing job (magic-byte sniffing, sharp re-encode, EXIF strip, thumbs); library grid, search, filters, detail sheet, soft delete (blocked if scheduled); media picker in composer; `ImageProvider` + first adapter; image prompt writer; satori text overlay with Bengali fonts; `ai-image` queue; Facebook photo publishing using media.
- **Testing:** file type spoofing (PNG header on an .exe → rejected); oversize → rejected; cross-tenant key access denied; overlay renders Bengali conjuncts correctly (golden image snapshot); publish post with image on the test Page.
- **Done when:** "Generate image" produces a usable 1:1 image with a correct Bangla headline overlay, attaches it, and it publishes.

## Phase 10 — Content plans (~5 days)

- **Features:** plan wizard UI (brief, date range, frequency, types, language, campaign, CTA); Stage A strategy + editable strategy card; Stage B slot allocator; Stage C batched writer with avoid lists; Stage D quality gate + repairs; `ai-plan` queue with progress in `async_tasks`; plan page (posts grouped by week); "Approve & schedule all" with per-slot times; local events data file (BD first); frequency guardrail note.
- **Testing:** allocator property tests (for random inputs: exact counts per pillar ±1, promo cap never exceeded, no adjacent same-pillar within a day, all slots inside allowed hours, DST-safe for non-BD zones); pipeline with mocked LLM, including partial batch failure → `partially_generated` with retry; golden-set evaluation run for 30-day × 3/day plans (duplicate rate < 5%).
- **Done when:** "30 days, 3/day, promote Eid collection" produces 90 varied, on-brand posts in under 5 minutes, on the calendar, ready to review.

## Phase 11 — AI Assistant & agent tools (~6 days)

- **Features:** `/assistant` UI (conversation list, streaming thread, cards); chat route with `streamText` + tool registry; all MVP tools from [05](05-ai-architecture.md); confirmation token flow + confirm endpoint; tool chips with human labels; ambiguity handling; conversation persistence + rolling summary; the ⌘K "Ask AI" sheet with page context; `remember_preference` → memories.
- **Testing:** **every tool:** validation, role authorization, cross-tenant ID rejected (404), confirmation required where declared, token replay rejected, token with altered args rejected, expired token rejected; agent scenario tests with a scripted fake model (deterministic tool-call sequences); a small live eval of 20 natural-language commands (EN/BN/Banglish) checking that the correct tools were chosen.
- **Done when:** all 10 example commands from your brief work end-to-end on staging, with confirmations exactly where specified.

## Phase 12 — Page analysis (~3 days)

- **Features:** `sync-page` (Page metadata + last 100 posts via official endpoints); classification + synthesis pipelines; merge rules (the user wins); analysis UI in Brand Brain + onboarding "Analyzing…" step; re-analyze button.
- **Testing:** merge-rule unit tests (never overwrite user fields); fixture-based classification with a mocked LLM; behavior with a Page with 0 posts or only images.
- **Done when:** connecting a real Page with history yields a sensible, clearly labeled profile within 60 s.

## Phase 13 — Analytics & notifications polish (~3 days)

- **Features:** `sync-insights` repeatable job (rate-limited per Page); metric normalization; snapshots + daily channel metrics; `/analytics` page; "Explain my results" (AI); scheduled-post-approaching notification (optional, off by default); notification preferences.
- **Testing:** normalizer maps missing metrics to absent (not 0); insights rate limit honored; UI renders "—" for unavailable metrics.
- **Done when:** analytics shows real numbers from the test Page within 6 h of publishing.

## Phase 14 — Landing page & pricing (~4 days)

- **Features:** full marketing site per [06](06-uiux-architecture.md) (hero demo animation, all sections, FAQ, pricing in BDT), SEO metadata, OG images, sitemap, analytics (privacy-friendly, e.g. Plausible/Umami).
- **Testing:** Lighthouse ≥ 90 performance / 100 accessibility on mobile; links; reduced-motion.
- **Done when:** the page converts a cold visitor to sign-up without explanation (validate with 5 real people).

## Phase 15 — Billing foundation & admin (~3 days)

- **Features:** plans seeded; usage page in Settings; quota meters everywhere costly; admin: users, workspaces (assign plan manually), failed publications, AI usage/cost by day and workspace, failed tasks, bull-board at `/admin/queues`; admin re-auth; `PaymentProvider` interface (no implementation).
- **Testing:** non-admin → 404 on all admin routes; plan change updates limits immediately; quota boundary tests (exactly at the limit, one over).
- **Done when:** you can onboard a paying beta customer by hand (bKash invoice → assign Starter in admin).

## Phase 16 — Hardening (~4 days)

- **Features:** full security checklist ([09](09-quality-security.md)); dependency audit; security headers + CSP; backups verified (restore drill); load test (500 scheduled posts in one minute → all publish); error-message review (no raw errors anywhere); Sentry alerts; runbook for "Meta API down", "LLM provider down", "worker stuck".
- **Done when:** the checklist is 100% green and the restore drill succeeds.

## Phase 17 — Production & launch (~3 days + beta period)

- **Features:** production environment (separate DB, Redis, R2 bucket, Meta app in Live mode after approval); domain + SSL; uptime monitoring; onboarding email sequence (optional); closed beta with 10–20 BD businesses; feedback widget.
- **Done when:** App Review is approved, 10 beta businesses are publishing weekly, and there have been no unresolved publish failures for 7 days.

---

## PART 10 — MVP DEFINITION

### MVP MUST HAVE

1. Email/password + Google auth with verification and password reset
2. Multi-tenant workspace model (single workspace per user in the UI)
3. 4-step skippable onboarding feeding the brand profile
4. **Facebook Page** connect / disconnect / reconnect via official OAuth, with encrypted tokens
5. Brand Brain: editable profile + memories ("remember that…")
6. AI post generation (single + batch ≤ 5) in English, Bangla, Banglish and mixed, with a quality gate
7. **AI content plans:** strategy → deterministic distribution → batched writing → review
8. AI images with a Bangla-safe text overlay + uploads + media library
9. Composer with Facebook validation and preview
10. Calendar: Month, Week and List, plus post detail sheet actions
11. Approval workflow (AI content never publishes unreviewed)
12. Durable scheduling + publishing worker with retries, failure states and reconciliation
13. **AI Assistant** with the 21 MVP tools and signed confirmations for bulk and destructive actions
14. Page analysis from the official API, clearly labeled
15. Basic analytics (only API-provided metrics)
16. In-app notifications + email for failures and disconnections
17. Settings (account, workspace, AI defaults, notifications, billing view)
18. Plan quotas enforced server-side; manual plan assignment in admin
19. Minimal admin (users, workspaces, failures, AI cost, queues)
20. Landing page, pricing (display), legal pages, data-deletion callback
21. Tenant-isolation, auth, AI-tool and publishing test suites in CI

### MVP SHOULD WAIT

| Deferred                                        | Reason it can wait                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Instagram and all other platforms               | Prove the loop on Facebook, where the BD market is. The adapter interface makes IG a 1–2 week add-on              |
| Bangla **UI** translation                       | Content is already Bangla. The UI is simple English, and strings are externalized so it's a translation job later |
| Payment gateway integration (SSLCommerz/Stripe) | Hand-sell the first customers. Automated billing before product-market fit is wasted effort                       |
| Team members, roles UI, approval chains         | Schema supports it. Solo owners are the first market                                                              |
| Agency multi-workspace switching                | Same as above                                                                                                     |
| Drag-and-drop calendar, day view                | The date picker covers rescheduling                                                                               |
| MCP server / MCP client integrations            | Tool registry is MCP-shaped, so adding it is an adapter later                                                     |
| Video posts, Reels, Stories                     | Upload/processing/API complexity is high; images first                                                            |
| Comment inbox / replies                         | Needs extra permissions and a moderation UX                                                                       |
| Auto-approve rules, autonomous agent mode       | Trust must be earned with reviewed content first                                                                  |
| Best-time-to-post ML                            | Needs our own engagement history. Use sensible defaults + page activity hours                                     |
| Voice input, PWA install, push notifications    | Nice mobile wins for BD, and next in line after launch                                                            |
| Advanced analytics, exports, reports            | Basic metrics first, then learn what users actually look at                                                       |
| Postgres RLS, SSO, 2FA for users                | Service-layer isolation + tests are sufficient at MVP scale. 2FA for admins comes first                           |

### What "done" means for the MVP

> A Dhaka boutique owner with no technical knowledge signs up on their phone. In under 10 minutes they connect their Page and say "Eid collection promote koro next 14 din, din e 2 ta post". They review a sensible plan in Banglish with good images, tap **Schedule all**, and the posts go out on time for two weeks. If one fails, they're told why and can fix it in one tap.
