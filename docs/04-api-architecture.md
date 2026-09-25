# 04 — API Architecture (Part 6)

## 6.1 Which mechanism for what

| Mechanism                                       | Used for                                                                              | Why                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React Server Components → services directly** | Initial page data (dashboard, lists, profile)                                         | No API round trip and no client JS for data fetching. Fastest first paint.                                                                        |
| **Route handlers `/api/v1/*` (JSON)**           | Every mutation and all interactive client data (calendar, composer, media grid, chat) | One consistent, HTTP-testable contract. The future mobile app/PWA and public API reuse it. Auth and error mapping are centralized in one wrapper. |
| **Server Actions**                              | Only simple form posts: auth screens, onboarding steps, settings forms                | Progressive enhancement and less boilerplate for form → redirect flows. They call the same services.                                              |
| **Streaming route `/api/v1/chat`**              | AI assistant                                                                          | Server-sent streaming of tokens, tool-call events and UI cards.                                                                                   |
| **OAuth callback routes**                       | Meta, Google                                                                          | Must be plain GET endpoints.                                                                                                                      |
| **Webhook routes**                              | Meta (deauthorize, data deletion, Page webhooks later), payments later                | Signature-verified, idempotent.                                                                                                                   |

Every route handler is wrapped with one helper:

```ts
export const POST = route(
  {
    auth: 'member', // 'public' | 'user' | 'member' | 'admin'
    permission: 'post:update', // checked against role
    rateLimit: 'mutation', // named bucket
    body: UpdatePostSchema, // zod
  },
  async ({ ctx, body, params }) => contentService.updatePost(ctx, params.id, body),
);
```

**Why a wrapper:** auth, rate limiting, validation, error mapping, request IDs and logging are enforced by construction. A new endpoint can't "forget" authorization.

## 6.2 Conventions

- Base path `/api/v1`. The workspace is resolved from the session's active workspace. **It is never taken from a URL or body param for authorization.** Resource IDs are always re-checked against `ctx.workspaceId`.
- JSON bodies, camelCase, ISO-8601 UTC timestamps, and clients send local times as `{ date, time, timezone }` or UTC.
- Cursor pagination: `?cursor=…&limit=…` → `{ items, nextCursor }`, with max `limit=100`.
- Errors use one shape:
  ```json
  { "error": { "code": "QUOTA_EXCEEDED", "message": "You've used all 30 AI posts this month.", "details": {…}, "requestId": "req_…" } }
  ```
  Codes: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION` 422, `CONFLICT` 409, `RATE_LIMITED` 429, `QUOTA_EXCEEDED` 402, `PLATFORM_ERROR` 502, `INTERNAL` 500. The message is always user-safe, and stack traces go only to Sentry.
- Mutations accept an `Idempotency-Key` header on publish/schedule endpoints, stored in Redis for 24 h.

## 6.3 Rate-limit buckets (Redis sliding window)

| Bucket        | Key        | Limit                                             |
| ------------- | ---------- | ------------------------------------------------- |
| `auth`        | IP + email | 5 / 15 min                                        |
| `read`        | user       | 300 / min                                         |
| `mutation`    | user       | 60 / min                                          |
| `ai`          | workspace  | 20 / min, plus monthly quota via billing          |
| `chat`        | user       | 30 messages / 5 min                               |
| `upload`      | workspace  | 30 / min                                          |
| `publish-now` | channel    | 10 / 10 min (also protects our Meta app standing) |

## 6.4 Endpoint catalogue (MVP)

### Auth (Better Auth-mounted, `/api/auth/*`)

`POST sign-up/email` · `POST sign-in/email` · `POST sign-out` · `POST forget-password` · `POST reset-password` · `GET verify-email` · `GET sign-in/social` (Google) · `GET session`

### Workspace & account

| Method | Path                | Purpose                                            |
| ------ | ------------------- | -------------------------------------------------- |
| GET    | `/api/v1/me`        | User, active workspace, role, plan, usage summary  |
| PATCH  | `/api/v1/me`        | Name, UI locale                                    |
| PATCH  | `/api/v1/workspace` | Name, timezone, AI defaults, notification defaults |

**Onboarding steps are Server Actions, not REST** (Phase 5). Each step saves through `updateBrandSection`, the same service `PATCH /api/v1/brand/:section` calls, so there is one validation path rather than two. A parallel `POST /api/v1/onboarding/:step` would have had no caller other than the wizard itself.

### Social connections

| Method | Path                               | Purpose                                                                                       |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/social/facebook/connect`  | Create `state` (Redis) → 302 to Meta OAuth dialog                                             |
| GET    | `/api/oauth/facebook/callback`     | Verify state → exchange code → fetch Pages → store encrypted tokens → redirect to page picker |
| GET    | `/api/v1/social/accounts`          | Accounts + channels + health (no tokens, ever)                                                |
| PATCH  | `/api/v1/social/channels/:id`      | Enable/disable a Page for publishing                                                          |
| POST   | `/api/v1/social/channels/:id/sync` | Enqueue `sync-page`                                                                           |
| DELETE | `/api/v1/social/accounts/:id`      | Disconnect: cancel future publications (with confirmation) and revoke the token at Meta       |

### Brand profile

| Method | Path                                     | Purpose                                |
| ------ | ---------------------------------------- | -------------------------------------- |
| GET    | `/api/v1/brand`                          | Profile + memories + last analysis     |
| PATCH  | `/api/v1/brand/:section`                 | Update one section (zod per section)   |
| POST   | `/api/v1/brand/analyze`                  | Enqueue `analyze-brand` → `{ taskId }` |
| POST   | `/api/v1/brand/memories` · DELETE `/:id` | Add/remove a memory                    |

### Content

| Method               | Path                                              | Purpose                                                     |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| GET                  | `/api/v1/posts?from&to&status&channelId&q&cursor` | Calendar/list query (joins publication + first media thumb) |
| POST                 | `/api/v1/posts`                                   | Create (manual)                                             |
| GET · PATCH · DELETE | `/api/v1/posts/:id`                               | Read / edit (creates revision) / soft delete                |
| POST                 | `/api/v1/posts/:id/duplicate`                     | Copy as draft                                               |
| POST                 | `/api/v1/posts/:id/approve`                       | → `approved`                                                |
| POST                 | `/api/v1/posts/bulk`                              | `{ ids, action: approve \| delete \| schedule }` (max 200)  |
| POST                 | `/api/v1/posts/:id/regenerate`                    | `{ instruction? }` → new revision (sync, single post)       |
| POST                 | `/api/v1/posts/:id/revisions/:revId/restore`      | Undo                                                        |
| POST                 | `/api/v1/posts/:id/validate`                      | Platform validation for the composer                        |
| POST                 | `/api/v1/ai/generate`                             | Single/small batch (≤ 5) sync generation → drafts           |

### Plans

| Method | Path                         | Purpose                                                               |
| ------ | ---------------------------- | --------------------------------------------------------------------- |
| POST   | `/api/v1/plans`              | `{ brief, params }` → Stage A (strategy) sync → plan `strategy_ready` |
| PATCH  | `/api/v1/plans/:id/strategy` | User edits pillars/weights                                            |
| POST   | `/api/v1/plans/:id/generate` | Enqueue Stages B+C → `{ taskId }`                                     |
| GET    | `/api/v1/plans/:id`          | Plan + strategy + post summaries                                      |
| POST   | `/api/v1/plans/:id/cancel`   | Stop generation (already generated posts are kept)                    |

### Scheduling & publishing

| Method | Path                             | Purpose                                                                                                               |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/posts/:id/schedule`     | `{ channelId, scheduledAt }` → publication + delayed job (post must be `approved`, channel healthy, time ≥ now+2 min) |
| PATCH  | `/api/v1/publications/:id`       | Reschedule (bumps `jobVersion`, swaps job)                                                                            |
| DELETE | `/api/v1/publications/:id`       | Unschedule → post returns to `approved`                                                                               |
| POST   | `/api/v1/posts/:id/publish-now`  | Immediate job (idempotency key required)                                                                              |
| POST   | `/api/v1/publications/:id/retry` | Failed → scheduled (now + 1 min)                                                                                      |

### Media

| Method         | Path                                 | Purpose                                                                                     |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| POST           | `/api/v1/media/uploads`              | `{ filename, mimeType, bytes }` → presigned PUT (checked against allowlist, size and quota) |
| POST           | `/api/v1/media/uploads/:id/complete` | Enqueue processing                                                                          |
| GET            | `/api/v1/media?q&source&cursor`      | Library grid (signed thumb URLs)                                                            |
| PATCH · DELETE | `/api/v1/media/:id`                  | Rename/tag/alt text · soft delete (blocked if attached to a scheduled post)                 |
| POST           | `/api/v1/media/generate`             | `{ postId?, prompt?, style?, overlayText? }` → `{ taskId }`                                 |

### AI assistant

| Method | Path                             | Purpose                                                                                                     |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/chat`                   | `{ conversationId?, message }` → **stream** of events (see [05](05-ai-architecture.md))                     |
| POST   | `/api/v1/chat/confirm`           | `{ confirmationToken, decision: 'approve'\|'reject' }` → executes the pending tool and continues the stream |
| GET    | `/api/v1/conversations` · `/:id` | History                                                                                                     |
| DELETE | `/api/v1/conversations/:id`      | Delete a thread                                                                                             |

### Tasks, notifications, analytics, billing

| Method | Path                                          | Purpose                                   |
| ------ | --------------------------------------------- | ----------------------------------------- |
| GET    | `/api/v1/tasks/:id`                           | Progress polling (2 s). SSE upgrade later |
| GET    | `/api/v1/notifications?cursor` · POST `/read` | Bell dropdown                             |
| GET    | `/api/v1/analytics/overview?channelId&range`  | Totals + trend + top posts                |
| GET    | `/api/v1/analytics/posts?…`                   | Per-post metrics table                    |
| GET    | `/api/v1/billing`                             | Plan, limits, usage this period           |

### Admin (`platformRole=admin`, re-auth ≤ 12 h)

`GET /api/admin/users` · `/workspaces` · `/workspaces/:id` · `/failed-publications` · `/ai-usage?groupBy=day|workspace` · `/tasks?status=failed` · `POST /api/admin/workspaces/:id/plan` (manual plan assignment) · `/admin/queues` (bull-board UI)

### Webhooks & platform callbacks

| Method   | Path                                            | Purpose                                                                                                             |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| POST     | `/api/webhooks/meta/deauthorize`                | Signed request (`X-Hub`/`signed_request` HMAC with app secret) → mark accounts revoked, cancel publications, notify |
| POST     | `/api/webhooks/meta/data-deletion`              | Required by Meta → delete that FB user's data, return `{ url, confirmation_code }`                                  |
| GET      | `/api/webhooks/meta/data-deletion/status?code=` | Status page URL returned above                                                                                      |
| GET/POST | `/api/webhooks/meta`                            | (Post-MVP) Page webhooks: verify token handshake + signature check                                                  |

Webhook rules: verify the HMAC signature **before** parsing and use constant-time comparison. Dedupe by event ID in Redis, respond 200 fast and do the work in a job.

### Health

`GET /api/health` → `{ db: ok, redis: ok, version }` (no secrets, no internals)
