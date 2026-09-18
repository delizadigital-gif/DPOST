# 08 — Facebook Integration: Credentials, Permissions, Limits

> Meta changes the Graph API frequently: permissions, metric names and review requirements. Everything below reflects the official model as I understand it, and **must be re-verified against Meta's current developer docs in Phase 8** (and whenever `META_GRAPH_VERSION` is bumped). The architecture isolates all of this inside the Facebook adapter, so changes stay local.

## 1. What we can and cannot do (be honest in the UI)

| Capability                                                                 | Possible via official API?                                                         | Our approach                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Publish text / link posts to a **Facebook Page**                           | ✅                                                                                 | `POST /{page-id}/feed`                                                             |
| Publish single/multiple photos to a Page                                   | ✅                                                                                 | `POST /{page-id}/photos` (multi-photo: upload unpublished, then attach in `/feed`) |
| Publish video / Reels to a Page                                            | ✅ (more complex)                                                                  | Post-MVP                                                                           |
| Publish to a **personal profile**                                          | ❌ Not permitted for third-party apps                                              | UI explains: "Facebook only allows apps to post to Pages"                          |
| Publish to **Groups**                                                      | ❌ Groups API was deprecated for third-party apps                                  | Not offered                                                                        |
| Native Facebook **polls** on Pages                                         | ❌ Not available via Graph API                                                     | "Question" posts written as engagement text                                        |
| Read the Page's own recent posts                                           | ✅ (with Page permissions)                                                         | Brand analysis                                                                     |
| Post-level metrics (reactions, comments, shares, some reach/views metrics) | ✅ Partially; **metric names are versioned and some have been deprecated**         | Normalizer + only show what's returned                                             |
| Page-level insights (followers, page views/reach-style metrics)            | ✅ Partially, with minimum thresholds                                              | Same                                                                               |
| Follower **demographics** / identities                                     | ⚠️ Mostly removed or aggregated with thresholds; **never individual identities**   | Not promised. Audience profile is "inferred from content"                          |
| Instagram publishing                                                       | ✅ for **Business/Creator** accounts linked to a Page (daily publish limits apply) | Post-MVP, reusing the same Meta app                                                |

## 2. Credentials you need

| Credential                                                      | Where to get it                                                                           | Env var                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| App ID                                                          | developers.facebook.com → Create App → type **Business**                                  | `META_APP_ID`                                 |
| App Secret                                                      | App → Settings → Basic                                                                    | `META_APP_SECRET` (server only, never client) |
| Login configuration ID (if using _Facebook Login for Business_) | App → Facebook Login for Business → Configurations: create one with the permissions below | `META_LOGIN_CONFIG_ID`                        |
| Graph API version                                               | Pin the current stable version                                                            | `META_GRAPH_VERSION`                          |
| Webhook verify token (post-MVP Page webhooks)                   | Random string you generate                                                                | `META_WEBHOOK_VERIFY_TOKEN`                   |

**App settings to configure:**

- App Domains: your domain(s).
- Valid OAuth Redirect URIs: `https://staging.example.com/api/oauth/facebook/callback`, `https://app.example.com/api/oauth/facebook/callback` (and `http://localhost:3000/...` for dev).
- Privacy Policy URL, Terms URL, **User Data Deletion** callback URL (`/api/webhooks/meta/data-deletion`), and the Deauthorize callback URL (`/api/webhooks/meta/deauthorize`).
- App icon, category and business contact email.
- Link the app to your verified **Business Portfolio**.

## 3. Permissions to request (MVP)

| Permission                | Why we need it                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pages_show_list`         | List Pages the user manages, for the page picker                                                                                          |
| `pages_manage_posts`      | Create posts on the Page (**the core permission**)                                                                                        |
| `pages_read_engagement`   | Read Page posts, metadata and engagement counts                                                                                           |
| `read_insights`           | Page and post insights for Analytics                                                                                                      |
| `pages_read_user_content` | _Only if needed:_ reading user-generated content on the Page (e.g. visitor posts/comments). Request later if the analysis doesn't need it |
| `business_management`     | _Only if needed:_ some Pages owned by a Business Portfolio require it to enumerate or access assets. Confirm during testing               |

**Principle:** request the minimum. Every extra permission lengthens App Review and lowers user trust on the consent screen.

## 4. Access levels & App Review

- **Development mode / Standard access:** everything works, but **only for people with a role on your app** (admins, developers, testers) and Pages they manage. This covers development and a small closed beta (add beta users as testers).
- **Advanced access (required for public launch):** requires **Business Verification** plus **App Review** per permission. Reviewers need:
  - A screencast per permission showing the real user flow: log in to DPOST → connect Facebook → select Page → create a post → schedule/publish → the post appears on the Page → analytics view.
  - Test credentials for our app (a reviewer account), plus clear written step-by-step instructions.
  - A live privacy policy explaining exactly what Facebook data we store and why, plus the data deletion flow.
- Rejections usually come from unclear screencasts or requesting permissions the video doesn't demonstrate. Plan for **at least one resubmission**.

### 4.1 Business Verification plan for DelizaDigital (no trade license yet)

Meta verifies a **legal business name, address and phone number** against official documents. Personal ID alone is not enough. Without verification, DPOST stays in Standard access: fine for building and a small closed beta, but it **cannot launch publicly**.

**Recommended path (start now, runs in parallel with Phases 1–8):**

1. **Trade license** for _DelizaDigital_ as a sole proprietorship from your local City Corporation / Pourashava / Union Parishad. You'll typically need your NID, photos, and proof of the business address (rent agreement or holding-tax receipt). Confirm the exact list and fees with your local office.
2. **e-TIN** (free, online from NBR). Useful supporting tax document and needed later for payments.
3. **Consistency** across all documents: the same business name ("DelizaDigital") and the same address everywhere, including on Meta.
4. **Domain + email**: a website on your own domain showing the business name, and a business email on that domain (e.g. `hello@<domain>`). Meta may verify ownership by domain or email.
5. Optional but helpful: a bank account or utility bill in the business name.

**Until verification is done:**

- Build and test with your own Facebook account and test Pages (this works fully in development mode).
- Closed beta: add up to a few dozen beta users to the Meta app as **Testers**. Each one must accept the invite from their own Facebook developer account. It's clunky, but works for a hand-held beta.
- Don't use a third party's verified business portfolio to host DPOST's app. The app, its data obligations and its reputation should belong to DelizaDigital.

## 5. OAuth & token lifecycle

```
1. /social/facebook/connect  → state (random 32B, stored in Redis 10 min, bound to userId+workspaceId)
2. Meta dialog (config_id or scope list) → user picks Pages + grants permissions
3. /oauth/facebook/callback?code&state
     verify state (single use) → exchange code → short-lived user token
     → exchange for long-lived user token (~60 days)
     → GET /me/accounts → Pages + page access tokens + tasks
     → keep Pages where the user has content-creation rights
     → encrypt + store (SocialAccount: user token; SocialChannel: page token)
4. Daily token-health job: debug_token → valid? scopes still granted?
     invalid / missing pages_manage_posts → channel.status = needs_reconnect → notify + email
```

- Page tokens obtained from a long-lived user token generally **don't expire on a timer**, but they **are invalidated** when the user changes their password, removes the app, loses their Page role, or when Meta invalidates the session. The token-health job plus the publish-time error handling (error code 190 → `AUTH` class → no retry → reconnect) cover this.
- **Why we don't use "Log in with Facebook" for app authentication:** different consent, different tokens, and a user may want to connect a Page owned by a _different_ Facebook account than the one they'd log in with. Keeping them separate avoids a whole class of "I disconnected my Page and got logged out" bugs.

## 6. Why we schedule in our own queue (not Facebook's native scheduling)

Facebook supports `scheduled_publish_time` on Page posts. We still use our own queue because:

1. Users can edit, approve or cancel up to the last minute, without syncing edits to Meta.
2. The same scheduling engine will serve Instagram, LinkedIn and others, which differ in native scheduling support.
3. Uniform failure handling, retries and notifications.
4. Native scheduling has time-window constraints.

Trade-off: we must run a reliable worker, which the reconcile job + retries + monitoring address.

## 7. Rate limits

- Page API calls count against **Business Use Case (BUC) rate limits** per Page, and app-level limits. Responses include usage headers (`X-Business-Use-Case-Usage`, `X-App-Usage`).
- The adapter parses these headers. Above 75% usage, the `sync-insights` queue for that Page is throttled. On rate-limit error codes, jobs are retried after the indicated wait (`RATE_LIMITED` class).
- Publishing gets priority over analytics sync: separate queues and a per-Page limiter that reserves headroom for publishing.

## 8. Error classification (adapter)

| Class          | Examples (Graph `code` / `error_subcode`)                                          | Action                                        |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `AUTH`         | 190 (invalid/expired token), 102, permission revoked (200-range permission errors) | No retry. Channel → `needs_reconnect`. Notify |
| `RATE_LIMITED` | 4, 17, 32, 613, 80001-range BUC                                                    | Retry after backoff/header hint               |
| `TRANSIENT`    | 1, 2, HTTP 5xx, timeouts                                                           | Retry with exponential backoff (3×)           |
| `PERMANENT`    | 100 (invalid parameter), duplicate content, media too large, content policy        | No retry. Show a specific user-facing reason  |

(Exact codes are verified with recorded fixtures during Phase 8 and kept in `adapters/facebook/errors.ts`.)

## 9. Data we store from Facebook, and deletion

| Stored                                               | Why                     | Deleted when                                                                                          |
| ---------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Facebook user ID, name                               | Identify the connection | Disconnect / data deletion request                                                                    |
| Encrypted user + page tokens                         | Publishing and sync     | Disconnect (also revoked via `DELETE /me/permissions`) / deletion request / token invalid for 30 days |
| Page ID, name, avatar URL, category, public metadata | Display, analysis       | Same                                                                                                  |
| Recent Page posts (text, type, time, counts)         | Brand analysis          | Same, or rolling 12 months                                                                            |
| Post insights snapshots                              | Analytics               | Same                                                                                                  |

The data-deletion callback verifies Meta's `signed_request`, deletes the above for that Facebook user ID, and returns a status URL + confirmation code, as Meta requires.
