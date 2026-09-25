# 03 — Database Schema (Part 5)

## 5.1 Entity map

```
                         users ──┬── sessions / auth_accounts / verifications   (Better Auth)
                                 │
                                 │ N:M via workspace_members (role)
                                 ▼
                           workspaces ─── subscriptions ── plans
                                 │   └── usage_counters
        ┌──────────────┬─────────┼──────────────┬──────────────┬───────────────┬──────────────┐
        ▼              ▼         ▼              ▼              ▼               ▼              ▼
 social_accounts  brand_profiles content_plans media_assets ai_conversations notifications audit_logs
        │           └ brand_memories  │                          │
        ▼                             ▼                          ▼
 social_channels ◄──────────── content_posts ◄── post_media ──► media_assets
   (FB Page, later IG)          │    └ post_revisions         ai_messages
        │                       ▼                                 └ ai_tool_calls
        │                  publications  (post × channel: schedule + delivery state)
        │                       └ publish_attempts
        ├── channel_metrics_daily
        └── (publications) ── post_metric_snapshots

 async_tasks (user-visible long jobs: plan generation, analysis)   ai_usage_events (cost ledger)
```

## 5.2 Key modelling decisions

| Decision                                                                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace is the tenant**, not the user                                                                   | Teams and agencies are on the roadmap. Retrofitting tenancy from user-owned data is one of the most painful migrations in SaaS. Every tenant table carries `workspace_id`.                                                                                                                                                                                                               |
| **`social_accounts` (the login/connection) vs `social_channels` (a publishable destination)**               | One Facebook login grants access to N Pages, and later IG accounts linked to those Pages. Tokens differ: the user token lives on the account, page tokens live on channels. When a user token dies, we know exactly which channels are affected. I renamed the proposed `social_pages` to `social_channels` because an Instagram account or a LinkedIn company page is the same concept. |
| **Editorial status on `content_posts`, delivery status on `publications`**                                  | "Approved" and "Failed" are orthogonal: an approved post can fail to publish, and a draft can't be scheduled. One merged status enum allows impossible states. Splitting also enables cross-posting one post to FB + IG with independent delivery states later. The UI shows a single **derived** badge.                                                                                 |
| **`publications` replaces the proposed `schedules`**                                                        | A schedule without a target is meaningless. The row that says "publish post X to Page Y at time T" is also the row that records "published as external ID Z" or "failed because W".                                                                                                                                                                                                      |
| **`post_revisions`**                                                                                        | Every AI regeneration or edit snapshots the previous text, which gives "Undo AI change" and version history for free. It also serves as the proposed `content_variations` table: alternatives are revisions with `kind='variant'`.                                                                                                                                                       |
| **Brand + audience merged into `brand_profiles`** (JSONB sections) + `brand_memories` rows                  | They're 1:1 with the workspace, read together into every prompt, and edited on one screen, so separate tables only add joins. Structured JSONB validated by zod lets the profile schema evolve without migrations. Memories are separate rows because they're added one at a time ("remember…"), individually deletable, and have provenance.                                            |
| **Metric snapshots, not counters**                                                                          | APIs return point-in-time values. Snapshots let us chart growth and never overwrite good data with a failed fetch.                                                                                                                                                                                                                                                                       |
| **`async_tasks` table**                                                                                     | The chat progress card and dashboard must show "Generating 6/14" from Postgres even if the user reloads. BullMQ state is operational and ephemeral, while this table is product state.                                                                                                                                                                                                   |
| **`ai_usage_events` ledger**                                                                                | Every LLM/image call records tokens, model and estimated cost. This drives quotas, the admin AI-cost view and pricing decisions.                                                                                                                                                                                                                                                         |
| **OAuth `state` in Redis (10 min TTL), not Postgres**                                                       | It's short-lived and single-use, and auto-expiry is exactly what Redis is good at.                                                                                                                                                                                                                                                                                                       |
| **Soft delete only where users expect undo** (posts, media) via `deleted_at`, and a purge job after 30 days | Accidental AI deletes are recoverable. The purge job keeps us honest about retention.                                                                                                                                                                                                                                                                                                    |
| **Timestamps in UTC (`timestamptz`) + `workspaces.timezone` (IANA, default `Asia/Dhaka`)**                  | Scheduling math happens in UTC, and display and AI date parsing ("tomorrow 8pm") use the workspace zone. This is the global-ready way to be Bangladesh-first.                                                                                                                                                                                                                            |
| **Money as integers in minor units + `currency`**                                                           | No float rounding bugs. BDT today, USD later.                                                                                                                                                                                                                                                                                                                                            |

### Changes made during implementation (Phase 2)

The source of truth is now [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma). It differs from the draft below in these ways:

- **`workspaceId` on every tenant-owned table**, including child tables that previously relied on their parent (`post_revisions`, `post_media`, `publish_attempts`, `ai_messages`). The tenant guard can then protect every table uniformly, rather than trusting each service to go through the parent.
- **Better Auth tables use Better Auth's field names** (`users`, `sessions`, `auth_accounts`, `verifications`), so Phase 3 needs no disruptive migration. Table names are snake_case plural via `@@map`.
- **IDs are UUIDv7** (`@default(uuid(7))`: time-ordered, not guessable), except the Better Auth tables, whose IDs Better Auth generates.
- **All timestamps are `timestamptz`.**
- **`audit_logs` has a `requestId` column**, to tie log lines to audit entries.
- **`plans` has a `sortOrder` column**, and subscriptions carry a `provider` default of `manual`.

### Changes made during implementation (Phase 5)

- **`workspaces.onboardingCompletedAt`** (nullable `timestamptz`): set when the owner finishes or dismisses the welcome wizard. A column rather than a key inside `settings`, because every signed-in page reads it to decide whether to send the user to onboarding.
- **`brand_profiles` sections hold per-field provenance**, exactly as the draft describes: `{ value, source: 'user' | 'onboarding' | 'analysis', updatedAt }` per field, validated section by section in [`packages/core/src/brand/sections.ts`](../packages/core/src/brand/sections.ts). A field written by a person is never overwritten by Page analysis.

## 5.3 Status machines

**`content_posts.status`** (editorial)

```
draft ─────────────┐
ai_generated ──► pending_review ──► approved ──► (archived)
     ▲                   │               │
     └── regenerate ◄────┴───── edit ────┘   (editing an approved, not-yet-published post → pending_review)
```

**`publications.status`** (delivery; only for `approved` posts)

```
scheduled ──► publishing ──► published
    │             │
    │             └──► failed ──(user retry)──► scheduled
    └──► cancelled
```

**Derived UI badge:** `publication.status` if one exists, otherwise `post.status`.

## 5.4 Prisma schema (draft)

> Draft for review. Better Auth's own tables (`user`, `session`, `account`, `verification`) are generated by its CLI and extended with our fields. They're abbreviated here.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Identity (Better Auth + extensions) ─────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified Boolean   @default(false)
  name          String?
  image         String?
  locale        String    @default("en")        // UI language
  platformRole  PlatformRole @default(user)     // 'admin' for internal staff
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  authAccounts  AuthAccount[]
  memberships   WorkspaceMember[]
  notifications Notification[]
  conversations AIConversation[]
}

enum PlatformRole { user admin }

model Session {                                   // managed by Better Auth
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  activeWorkspaceId String?
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model AuthAccount {                               // Better Auth "account": password hash / Google
  id           String  @id @default(cuid())
  userId       String
  providerId   String                             // 'credential' | 'google'
  accountId    String
  password     String?                            // argon2id hash (credential provider only)
  user         User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([providerId, accountId])
}

// ───────────────────────── Tenancy ─────────────────────────

model Workspace {
  id         String   @id @default(cuid())
  name       String
  slug       String   @unique
  timezone   String   @default("Asia/Dhaka")    // IANA
  locale     String   @default("en")
  country    String   @default("BD")            // ISO-3166
  settings   Json     @default("{}")            // AI defaults, notification defaults (zod-validated)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  members        WorkspaceMember[]
  socialAccounts SocialAccount[]
  channels       SocialChannel[]
  brandProfile   BrandProfile?
  brandMemories  BrandMemory[]
  plans          ContentPlan[]
  posts          ContentPost[]
  media          MediaAsset[]
  conversations  AIConversation[]
  subscription   Subscription?
  usage          UsageCounter[]
  tasks          AsyncTask[]
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(owner)
  createdAt   DateTime      @default(now())
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([workspaceId, userId])
  @@index([userId])
}

enum WorkspaceRole { owner admin editor viewer }

// ───────────────────────── Social ─────────────────────────

model SocialAccount {                             // one OAuth connection (e.g. a Facebook user)
  id               String          @id @default(cuid())
  workspaceId      String
  platform         SocialPlatform
  externalUserId   String
  displayName      String?
  tokenCiphertext  String                         // AES-256-GCM
  tokenIv          String
  tokenTag         String
  tokenKeyVersion  Int
  tokenExpiresAt   DateTime?
  scopes           String[]
  status           ConnectionStatus @default(active)
  lastCheckedAt    DateTime?
  connectedById    String                         // userId who connected
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  workspace        Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channels         SocialChannel[]
  @@unique([workspaceId, platform, externalUserId])
}

model SocialChannel {                             // a publishable destination: FB Page (later IG account…)
  id               String          @id @default(cuid())
  workspaceId      String
  socialAccountId  String
  platform         SocialPlatform
  kind             ChannelKind                    // facebook_page | instagram_business | ...
  externalId       String                         // Page ID
  name             String
  username         String?
  avatarUrl        String?
  category         String?                        // Page category from Graph API
  tokenCiphertext  String?                        // page access token (encrypted)
  tokenIv          String?
  tokenTag         String?
  tokenKeyVersion  Int?
  status           ConnectionStatus @default(active)
  isActive         Boolean         @default(true) // user-selected for publishing
  lastSyncedAt     DateTime?
  meta             Json            @default("{}") // follower count, about, website… (as returned)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  workspace        Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  socialAccount    SocialAccount   @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)
  publications     Publication[]
  importedPosts    ImportedPost[]
  dailyMetrics     ChannelMetricDaily[]
  @@unique([workspaceId, platform, externalId])
  @@index([workspaceId, status])
}

enum SocialPlatform   { facebook instagram linkedin tiktok youtube x threads pinterest }
enum ChannelKind      { facebook_page instagram_business }
enum ConnectionStatus { active needs_reconnect revoked error }

model ImportedPost {                              // existing Page posts pulled for brand analysis
  id           String   @id @default(cuid())
  workspaceId  String
  channelId    String
  externalId   String
  message      String?
  mediaType    String?
  permalink    String?
  postedAt     DateTime
  metrics      Json     @default("{}")
  classification Json?                            // AI: contentType, pillar, tone, isPromo
  channel      SocialChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  @@unique([channelId, externalId])
  @@index([workspaceId, postedAt])
}

// ───────────────────────── Brand / AI memory ─────────────────────────

model BrandProfile {
  id           String   @id @default(cuid())
  workspaceId  String   @unique
  // Each section is zod-validated JSON with per-field provenance: { value, source: 'user'|'onboarding'|'analysis', updatedAt }
  business     Json     @default("{}")          // name, type, industry, description, location, website
  offerings    Json     @default("{}")          // products/services, price range, USPs
  audience     Json     @default("{}")          // segments, pain points, desires, locations, languages
  voice        Json     @default("{}")          // tone, formality, emoji use, dos/donts, sample phrases
  contentMix   Json     @default("{}")          // pillars with weights, promo ratio, preferred types
  preferences  Json     @default("{}")          // language, frequency, posting windows, hashtags policy, CTA defaults
  analysis     Json?                            // last page-analysis output (read-only, for transparency)
  version      Int      @default(1)             // bump on every change → cache key for prompts
  updatedAt    DateTime @updatedAt
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model BrandMemory {                               // "Remember that…" facts
  id          String   @id @default(cuid())
  workspaceId String
  content     String                            // "Always sign off with 'Team Aarong-style'"
  category    MemoryCategory
  source      MemorySource                      // chat | settings | analysis
  createdById String?
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId])
}

enum MemoryCategory { voice audience product policy schedule other }
enum MemorySource   { chat settings analysis }

// ───────────────────────── Content ─────────────────────────

model ContentPlan {
  id           String     @id @default(cuid())
  workspaceId  String
  title        String
  brief        String                             // user's original request
  params       Json                               // {startDate,endDate,postsPerDay,channels,language,types,campaign…}
  strategy     Json?                              // Stage A output: pillars, weights, themes, arcs
  status       PlanStatus @default(draft)
  createdById  String
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  workspace    Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  posts        ContentPost[]
  @@index([workspaceId, createdAt])
}

enum PlanStatus { draft strategy_ready generating generated partially_generated failed cancelled }

model ContentPost {
  id           String      @id @default(cuid())
  workspaceId  String
  planId       String?
  title        String?                            // internal label, e.g. "Eid offer – day 3"
  body         String                             // caption / text
  hashtags     String[]
  cta          String?
  link         String?
  language     ContentLanguage @default(en)
  contentType  ContentType?
  pillar       String?
  status       PostStatus  @default(draft)
  source       PostSource  @default(manual)
  plannedFor   DateTime?                          // plan slot time (before a publication exists)
  aiMeta       Json?                              // model, prompt version, brief used, similarity score
  createdById  String
  approvedById String?
  approvedAt   DateTime?
  deletedAt    DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  workspace    Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  plan         ContentPlan? @relation(fields: [planId], references: [id], onDelete: SetNull)
  media        PostMedia[]
  revisions    PostRevision[]
  publications Publication[]
  @@index([workspaceId, status])
  @@index([workspaceId, plannedFor])
  @@index([planId])
}

enum PostStatus      { draft ai_generated pending_review approved archived }
enum PostSource      { manual ai_single ai_plan ai_chat }
enum ContentLanguage { en bn banglish mixed }
enum ContentType     { promotional educational inspirational engagement product_showcase announcement storytelling tips offer question behind_the_scenes testimonial }

model PostRevision {
  id          String   @id @default(cuid())
  postId      String
  kind        RevisionKind                        // edit | regenerate | variant
  body        String
  hashtags    String[]
  cta         String?
  instruction String?                             // "make it more engaging"
  createdById String?
  createdAt   DateTime @default(now())
  post        ContentPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@index([postId, createdAt])
}

enum RevisionKind { edit regenerate variant }

model PostMedia {
  postId    String
  mediaId   String
  position  Int     @default(0)
  post      ContentPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  media     MediaAsset  @relation(fields: [mediaId], references: [id], onDelete: Restrict)
  @@id([postId, mediaId])
}

// ───────────────────────── Scheduling & publishing ─────────────────────────

model Publication {                               // post × channel × time  (replaces "schedules")
  id              String            @id @default(cuid())
  workspaceId     String
  postId          String
  channelId       String
  scheduledAt     DateTime                        // UTC
  status          PublicationStatus @default(scheduled)
  jobVersion      Int               @default(1)   // bump on reschedule → new BullMQ jobId
  externalPostId  String?
  externalUrl     String?
  publishedAt     DateTime?
  failureCode     String?                         // normalized: AUTH | RATE_LIMITED | CONTENT_REJECTED | …
  failureMessage  String?                         // user-safe message
  attemptCount    Int               @default(0)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  post            ContentPost       @relation(fields: [postId], references: [id], onDelete: Cascade)
  channel         SocialChannel     @relation(fields: [channelId], references: [id], onDelete: Cascade)
  attempts        PublishAttempt[]
  metrics         PostMetricSnapshot[]
  @@unique([postId, channelId])
  @@index([status, scheduledAt])                  // reconcile sweeper
  @@index([workspaceId, scheduledAt])             // calendar queries
}

enum PublicationStatus { scheduled publishing published failed cancelled }

model PublishAttempt {
  id             String   @id @default(cuid())
  publicationId  String
  attempt        Int
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
  ok             Boolean  @default(false)
  errorClass     String?                          // TRANSIENT | RATE_LIMITED | AUTH | PERMANENT
  errorCode      String?                          // raw platform code
  errorDetail    String?                          // sanitized; never tokens
  publication    Publication @relation(fields: [publicationId], references: [id], onDelete: Cascade)
  @@index([publicationId])
}

// ───────────────────────── Media ─────────────────────────

model MediaAsset {
  id          String      @id @default(cuid())
  workspaceId String
  source      MediaSource
  status      MediaStatus @default(processing)
  kind        MediaKind   @default(image)
  storageKey  String?                             // ws/{workspaceId}/media/{id}/display.webp
  thumbKey    String?
  mimeType    String?
  width       Int?
  height      Int?
  bytes       Int?
  filename    String?
  altText     String?
  tags        String[]
  prompt      String?                             // for AI images
  provider    String?                             // which ImageProvider produced it
  createdById String?
  deletedAt   DateTime?
  createdAt   DateTime    @default(now())
  workspace   Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  posts       PostMedia[]
  @@index([workspaceId, createdAt])
  @@index([workspaceId, source])
}

enum MediaSource { upload ai brand_asset imported }
enum MediaStatus { processing ready failed }
enum MediaKind   { image video }

// ───────────────────────── AI assistant ─────────────────────────

model AIConversation {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  title       String?
  summary     String?                             // rolling summary for long threads
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages    AIMessage[]
  @@index([workspaceId, userId, updatedAt])
}

model AIMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           MessageRole
  parts          Json                             // [{type:'text'},{type:'tool_call'},{type:'ui_card'}…]
  tokensIn       Int?
  tokensOut      Int?
  createdAt      DateTime @default(now())
  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  toolCalls      AIToolCall[]
  @@index([conversationId, createdAt])
}

enum MessageRole { user assistant tool system }

model AIToolCall {
  id              String   @id @default(cuid())
  messageId       String
  workspaceId     String
  userId          String
  toolName        String
  input           Json
  output          Json?
  status          ToolCallStatus
  risk            ToolRisk
  confirmationId  String?  @unique                // nonce embedded in the signed confirmation token
  confirmedAt     DateTime?
  durationMs      Int?
  error           String?
  createdAt       DateTime @default(now())
  message         AIMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  @@index([workspaceId, createdAt])
}

enum ToolCallStatus { pending awaiting_confirmation confirmed rejected succeeded failed expired }
enum ToolRisk       { read write bulk destructive external }

model AIUsageEvent {
  id           String   @id @default(cuid())
  workspaceId  String
  userId       String?
  feature      String                             // chat | plan_strategy | post_batch | image | analysis
  provider     String
  model        String
  inputTokens  Int      @default(0)
  outputTokens Int      @default(0)
  images       Int      @default(0)
  costMicros   BigInt   @default(0)             // USD micro-units, estimated
  createdAt    DateTime @default(now())
  @@index([workspaceId, createdAt])
  @@index([createdAt])
}

// ───────────────────────── Background task tracking ─────────────────────────

model AsyncTask {
  id          String     @id @default(cuid())
  workspaceId String
  type        String                               // generate_plan | analyze_brand | generate_image
  status      TaskStatus @default(queued)
  progress    Int        @default(0)
  total       Int?
  refType     String?                              // 'content_plan'
  refId       String?
  result      Json?
  error       String?                              // user-safe
  createdById String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId, status])
}

enum TaskStatus { queued running succeeded partially_succeeded failed cancelled }

// ───────────────────────── Analytics ─────────────────────────

model PostMetricSnapshot {
  id            String   @id @default(cuid())
  workspaceId   String
  publicationId String
  capturedAt    DateTime @default(now())
  metrics       Json                             // normalized keys + raw
  publication   Publication @relation(fields: [publicationId], references: [id], onDelete: Cascade)
  @@index([publicationId, capturedAt])
  @@index([workspaceId, capturedAt])
}

model ChannelMetricDaily {
  id          String   @id @default(cuid())
  workspaceId String
  channelId   String
  date        DateTime @db.Date
  metrics     Json
  channel     SocialChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  @@unique([channelId, date])
}

// ───────────────────────── Notifications ─────────────────────────

model Notification {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  type        String                             // post_published | post_failed | account_disconnected | …
  title       String
  body        String?
  href        String?                            // deep link inside the app
  readAt      DateTime?
  emailedAt   DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt])
}

// ───────────────────────── Billing ─────────────────────────

model Plan {
  id          String   @id                        // 'free' | 'starter' | 'business' | 'agency'
  name        String
  limits      Json                                // {aiPosts, aiImages, scheduledPosts, channels, members, workspaces}
  features    Json     @default("{}")
  prices      Json     @default("[]")             // [{currency:'BDT', interval:'month', amountMinor: 99900}]
  isPublic    Boolean  @default(true)
  subscriptions Subscription[]
}

model Subscription {
  id                 String   @id @default(cuid())
  workspaceId        String   @unique
  planId             String
  status             SubscriptionStatus @default(active)
  provider           String?                     // manual | sslcommerz | stripe
  providerRef        String?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAt           DateTime?
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  plan               Plan      @relation(fields: [planId], references: [id])
}

enum SubscriptionStatus { trialing active past_due canceled }

model UsageCounter {
  workspaceId String
  metric      String                             // ai_posts | ai_images | scheduled_posts
  periodStart DateTime @db.Date
  count       Int      @default(0)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@id([workspaceId, metric, periodStart])
}

// ───────────────────────── Audit ─────────────────────────

model AuditLog {
  id          String   @id @default(cuid())
  workspaceId String?
  actorUserId String?
  actorType   ActorType                          // user | agent | system | admin
  action      String                             // post.delete, channel.disconnect, plan.schedule_all…
  targetType  String?
  targetId    String?
  metadata    Json     @default("{}")            // diff summary, toolCallId; never secrets
  ip          String?
  createdAt   DateTime @default(now())
  @@index([workspaceId, createdAt])
  @@index([actorUserId, createdAt])
}

enum ActorType { user agent system admin }
```

## 5.5 Critical queries & indexes

| Query                                                                       | Index used                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Calendar month view: publications + unscheduled planned posts in date range | `publications(workspaceId, scheduledAt)`, `content_posts(workspaceId, plannedFor)` |
| Reconcile sweeper: due but not published                                    | `publications(status, scheduledAt)`                                                |
| Unread notifications badge                                                  | `notifications(userId, readAt, createdAt)`                                         |
| Quota check                                                                 | `usage_counters` PK (single-row lookup)                                            |
| Dedupe context: last 60 posts' openings                                     | `content_posts(workspaceId, status)` + `createdAt` order, capped                   |
| AI cost per workspace/month                                                 | `ai_usage_events(workspaceId, createdAt)`                                          |

## 5.6 Migration & data rules

- Prisma Migrate. Every migration is reviewed. **No destructive migration without a two-step expand/contract** once production data exists.
- Seed script: plans, one demo workspace with sample posts (dev only).
- Retention: soft-deleted posts/media are purged after 30 days. `ai_messages` are kept 12 months. `audit_logs` are kept 24 months. On account deletion we revoke social tokens at Meta, then hard-delete the workspace. Meta requires a **data-deletion callback** (see [08](08-facebook-integration.md)).
