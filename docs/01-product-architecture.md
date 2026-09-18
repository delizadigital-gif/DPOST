# 01 — Product Architecture, Feature Tiers, User Journey

## PART 1 — Product Architecture

### 1.1 System at a glance

```
                        ┌──────────────────────────────────────────────┐
  Browser / Mobile  ──► │  Next.js app (web)                           │
  (React, RSC)          │  • Marketing site      • Dashboard UI        │
                        │  • Auth routes         • REST /api/v1        │
                        │  • Chat endpoint (streaming)                 │
                        │  • OAuth callbacks     • Webhooks            │
                        └───────────────┬──────────────────────────────┘
                                        │ calls (in-process)
                        ┌───────────────▼──────────────────────────────┐
                        │  core  (shared TypeScript package)           │
                        │  services/   ← the ONLY business logic       │
                        │  ai/         ← LLM + image providers, agent  │
                        │  social/     ← platform adapters (Facebook)  │
                        │  tools/      ← AI tool registry over services│
                        │  auth/       ← authz policies, tenant guard  │
                        └───┬───────────┬───────────┬──────────┬───────┘
                            │           │           │          │
                    ┌───────▼──┐  ┌─────▼────┐ ┌────▼────┐ ┌───▼─────────┐
                    │PostgreSQL│  │  Redis   │ │   R2    │ │ External    │
                    │ (Prisma) │  │ queue +  │ │ (media) │ │ Meta Graph  │
                    │          │  │ ratelimit│ │         │ │ LLM / Image │
                    └──────────┘  └─────┬────┘ └─────────┘ │ Email       │
                                        │ jobs             └─────────────┘
                        ┌───────────────▼──────────────────────────────┐
                        │  worker (Node process, same repo)            │
                        │  publish · generate-plan · generate-image    │
                        │  sync-page · sync-insights · token-health    │
                        │  notify · cleanup                            │
                        └──────────────────────────────────────────────┘
```

**Why this shape:** the web app and worker are two entry points into the **same** `core`. Nothing is duplicated, and no business rule can drift between "what the UI allows" and "what the AI allows" or "what the worker does".

### 1.2 Bounded modules inside `core`

| Module          | Owns                                                                | Talks to                        |
| --------------- | ------------------------------------------------------------------- | ------------------------------- |
| `identity`      | users, sessions, workspace membership, roles                        | Better Auth                     |
| `workspace`     | workspaces, settings, quotas                                        | identity, billing               |
| `social`        | connected accounts, pages, tokens, publishing adapters              | Meta Graph API                  |
| `brand`         | brand profile, audience profile, memories, page analysis            | ai, social                      |
| `content`       | posts, variations, plans, statuses, validation                      | brand, ai, media                |
| `scheduling`    | schedules, publish jobs, retries                                    | content, social, queue          |
| `media`         | uploads, AI images, compositing, library                            | R2, ai                          |
| `ai`            | provider abstraction, prompts, generation pipelines, usage metering | LLM/image vendors               |
| `agent`         | conversations, tool registry, confirmation, audit                   | every service above (via tools) |
| `analytics`     | insight snapshots, rollups                                          | social                          |
| `notifications` | in-app + email notifications                                        | email provider                  |
| `billing`       | plans, subscriptions, usage limits                                  | payment providers (later)       |
| `admin`         | read-only ops views                                                 | everything, read-only           |

A rule for the whole codebase: **modules call other modules' services, never their tables.**

### 1.3 Product principle, translated into engineering rules

"Complexity should live inside the software, not with the user." In practice:

1. **Every screen has one primary action.** Secondary actions go in menus.
2. **The AI goes first.** Empty states offer "Ask AI to…" before "Create manually".
3. **Never show platform jargon.** Show "Reconnect Facebook" instead of "OAuthException code 190", and "Facebook needs you to log in again" instead of "token expired".
4. **Every AI action is reviewable.** Nothing AI-generated publishes without passing through an approval state, unless the user explicitly enables auto-approve (post-MVP).
5. **Every failure is visible and recoverable.** A failed post stays on the calendar in red with a "Retry" button. It never disappears.

---

## PART 2 — Feature Architecture

### 2.1 MVP (build now)

| Area               | In MVP                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing          | Landing page (all requested sections), pricing (display-only), FAQ, legal pages (Privacy Policy and Terms are **required by Meta App Review**)                       |
| Auth               | Email+password sign-up, email verification, login, logout, forgot/reset password, protected routes, Google sign-in (low cost with Better Auth, high conversion gain) |
| Onboarding         | 4-step wizard (Business → Audience → Voice & Goals → Connect Facebook), every field skippable except the name                                                        |
| Social             | Facebook Pages only: connect, select Pages, disconnect, reconnect, token health check                                                                                |
| Brand AI           | Page analysis from the official API (recent posts + Page metadata) plus onboarding answers, producing an editable Brand & Audience Profile with "memories"           |
| Content generation | Single post, batch posts, and **content plans** (strategy → pillars → distribution → posts), with hashtags, CTA, Bangla/English/Banglish                             |
| Images             | AI image per post (generate / regenerate / replace / delete), Bangla-safe text overlay, uploads                                                                      |
| Composer           | Account, text, media, hashtags, CTA, date/time, platform validation, preview, save draft / schedule / publish now                                                    |
| Calendar           | Month, week and list views, status colors, quick actions (edit, duplicate, delete, reschedule via date picker, approve, regenerate)                                  |
| AI Assistant       | Streaming chat, 21 tools (see [05](05-ai-architecture.md)), confirmation cards, job-progress cards, conversation history                                             |
| Scheduling         | Durable queue, publish worker, retries with backoff, failure states, "publishing now" states                                                                         |
| Media library      | Grid, upload, search by name/tag, filter (uploaded / AI), delete, reuse in composer                                                                                  |
| Analytics          | Per-Page: posts published, reactions, comments, shares, and reach/impressions **where the API returns them**, plus top posts and posting frequency                   |
| Notifications      | In-app bell (published, failed, token expiring, generation done), plus email for failures and disconnections only                                                    |
| Settings           | Account, workspace name, AI defaults (language, tone), notification prefs, connected accounts, billing page (plan + usage, no checkout)                              |
| Tenancy            | Workspace model from day one. One workspace per user in the UI, but schema and authz are fully multi-tenant                                                          |
| Quotas             | Per-plan limits on AI generations, images and scheduled posts, enforced server-side                                                                                  |
| Admin              | Protected `/admin`: users, workspaces, failed jobs, AI usage, read-only                                                                                              |
| i18n               | UI strings externalized via `next-intl` (English only at launch). Content generation supports Bangla, English and Banglish from day one                              |

### 2.2 Post-MVP (next 1–3 months after launch)

- **Instagram** Business/Creator publishing (reuses the Facebook OAuth app and a large share of the code)
- Bangla UI translation (strings are already externalized)
- Drag-and-drop rescheduling on the calendar
- Day view on the calendar
- Real payments: **SSLCommerz** (bKash/Nagad/cards for Bangladesh) plus **Stripe** (international)
- Team members with roles (Owner / Admin / Editor / Viewer) and an approval workflow
- Agency mode: multiple workspaces per user with a workspace switcher
- Auto-approve rules ("auto-schedule educational posts, hold promotional ones for review")
- Best-time-to-post recommendations from our own engagement history
- Content recycling ("repost top performers with fresh captions")
- **MCP server** exposing our tools to external agents (Claude Desktop, etc.)
- Comment inbox (read and reply to Page comments; needs extra permissions)

### 2.3 Future (6+ months)

- LinkedIn, TikTok, YouTube, X, Threads, Pinterest adapters
- Video generation and short-form video scheduling
- Autonomous "agent mode" (weekly self-planning with a human-in-the-loop digest)
- Competitor/benchmark analysis (only via legitimate data sources)
- Ads integration (Meta Marketing API)
- White-label for agencies
- Public API and webhooks for customers
- Mobile app (a PWA first)

### 2.4 Explicitly NOT building (and why)

| Not building                                       | Why                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Posting to **personal Facebook profiles**          | Not possible through Meta's official API. Only Pages (and IG professional accounts) can be published to. We say this clearly in the UI. |
| Scraping any platform                              | Violates platform terms, is fragile, and risks the Meta app being banned.                                                               |
| Facebook Groups publishing                         | Meta has removed Groups publishing from the Graph API for third-party apps.                                                             |
| Audience demographics beyond what Insights returns | We will never imply we know private follower data.                                                                                      |
| Our own LLM or fine-tuning                         | Prompting plus brand context gets 95% of the value. Revisit only with real data.                                                        |
| Microservices / Kubernetes                         | Wrong trade-off for one developer. The modular monolith can be split later along module boundaries.                                     |
| Complex billing (proration, coupons, dunning)      | Not before paying users exist.                                                                                                          |
| Real-time collaborative editing                    | No evidence users need it.                                                                                                              |

---

## PART 3 — User Journey

```
Landing ─► Sign up ─► Verify email ─► Onboarding (4 steps) ─► Connect Facebook ─► Pick Pages
   │                                                                                 │
   │                                                          (background job) ◄─────┘
   │                                                          Analyze Page
   │                                                                │
   ▼                                                                ▼
Dashboard ◄──────────── "Your Brand Profile is ready" ◄──── Brand & Audience Profile
   │
   ├─► AI Assistant: "Plan 7 days, 2 posts/day, promote my Eid collection"
   │        │
   │        ├─ Strategy card (pillars, mix, cadence) ── [Looks good] / [Adjust]
   │        ├─ Generation job (progress card: 6/14 posts…)
   │        └─ Review card: 14 posts ─ [Open in calendar] [Approve all] [Schedule all]
   │
   ├─► Calendar: review each post ─ edit ─ regenerate ─ add image ─ approve
   │
   ├─► Schedule ─► (queue) ─► Publish worker ─► Facebook ─► status: Published ✓
   │                                              └─► failed ─► retry ×3 ─► status: Failed + notification
   │
   └─► Analytics (after insights sync): what worked ─► feeds back into Brand Profile
```

### Step-by-step with what happens underneath

| Step                           | User sees                                                                                                                                                                                     | System does                                                                                                                  | Time budget              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1. Landing                     | Hero with a live-typing demo prompt → animated calendar filling up                                                                                                                            | Static/ISR page, no auth                                                                                                     | < 1.5 s LCP              |
| 2. Sign up                     | Email + password, or Google                                                                                                                                                                   | Better Auth creates `user`, then a **default workspace** plus an `owner` membership in one transaction                       | < 30 s                   |
| 3. Verify email                | "Check your inbox". The user can continue onboarding while unverified, but **cannot connect Facebook or publish** until verified                                                              | Resend email with signed token                                                                                               | —                        |
| 4. Onboarding 1: Business      | Name*, type (chips: Shop / Brand / Creator / Service / Agency), industry (searchable), short description                                                                                      | Writes `brand_profiles` (source = `onboarding`)                                                                              | 45 s                     |
| 5. Onboarding 2: Audience      | Who you sell to, location (default Bangladesh, Dhaka), products/services (tag input)                                                                                                          | Writes `audience_profiles`                                                                                                   | 45 s                     |
| 6. Onboarding 3: Voice & goals | Tone (visual cards: Friendly / Professional / Playful / Premium / Bold), language (English / বাংলা / Banglish / Mixed), goals (sales, awareness, engagement…), frequency (slider: posts/week) | Writes brand defaults                                                                                                        | 45 s                     |
| 7. Onboarding 4: Connect       | Big "Connect Facebook Page" button, plus "Skip for now"                                                                                                                                       | Starts Meta OAuth (state + PKCE-style nonce stored server-side)                                                              | —                        |
| 8. Pick Pages                  | List of Pages the user manages, with checkboxes                                                                                                                                               | Exchanges code → long-lived user token → page tokens, **encrypts** them, stores `social_accounts` + `social_pages`           | < 10 s                   |
| 9. Analyze                     | "Reading your last 50 posts…" with a skeleton of the profile                                                                                                                                  | Job `sync-page` → `analyze-brand`: the LLM classifies posts into content types, extracts voice, themes, cadence, promo ratio | 20–60 s async            |
| 10. Brand profile              | Editable cards: _Voice, Audience, Products, Pillars, Do / Don't_, each field tagged "from onboarding" or "learned from your Page"                                                             | Merges onboarding + analysis. The user always wins on conflicts                                                              | —                        |
| 11. First plan                 | Dashboard prompt suggestions ("Plan my next 7 days")                                                                                                                                          | Agent → `create_content_plan`                                                                                                | —                        |
| 12. Strategy review            | Card with pillars (e.g. 40% product, 25% tips, 20% engagement, 15% offers), a posting grid, and campaign notes                                                                                | Stage A output, persisted as a `content_plan` in `strategy_ready`                                                            | 5–10 s                   |
| 13. Generate                   | Progress card that streams "Writing post 6 of 14…"                                                                                                                                            | Stages B+C in the worker. Posts are created in `ai_generated` status                                                         | ~2–4 s per post, batched |
| 14. Review                     | Calendar filled with posts in amber "Needs review" state                                                                                                                                      | —                                                                                                                            | —                        |
| 15. Approve & schedule         | "Approve all" or per-post approval → "Schedule 14 posts" confirmation                                                                                                                         | Creates `schedules`, enqueues **delayed jobs** at exact publish times                                                        | —                        |
| 16. Publish                    | At the scheduled time the status flips to Publishing, then Published, with a link to the live post                                                                                            | Worker calls Graph API with the decrypted page token and stores `external_post_id`                                           | —                        |
| 17. Analytics                  | After 24 h: reactions / comments / shares / reach per post, plus a "Top posts" list                                                                                                           | `sync-insights` job every 6 h for posts < 7 days old, daily for < 30 days                                                    | —                        |
| 18. Loop                       | AI recommendation card: "Your tips posts get 2.3× more comments. Plan more?"                                                                                                                  | Rollups feed a short "performance summary" into the brand context                                                            | —                        |

### Journey design choices (and why)

- **Onboarding before connecting Facebook.** Many Bangladeshi small businesses will stall at Meta OAuth (wrong account, not a Page admin). Collecting business context first means the AI is already useful even if they skip connection. They can still generate and download or copy posts.
- **Unverified users can explore but not publish.** This cuts sign-up friction without letting throwaway accounts spam Pages through our Meta app. Protecting our app's standing with Meta protects every customer.
- **Strategy is confirmed before generating 150 posts.** A 5-second, cheap LLM call lets the user redirect before we spend money and their time on 150 posts they don't want.
