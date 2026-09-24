# DPOST

**Complete Solution for your Smart Business**

AI social media manager for businesses and creators, built Bangladesh-first by **DelizaDigital**.
Tell it what to post; it plans, writes, designs, schedules and publishes.

The architecture and roadmap are in [`docs/`](docs/README.md). The current phase is tracked in [`docs/07-roadmap.md`](docs/07-roadmap.md).

## Prerequisites

| Tool           | Version | Notes                                                                              |
| -------------- | ------- | ---------------------------------------------------------------------------------- |
| Node.js        | 24 LTS  | See `.nvmrc`                                                                       |
| pnpm           | 12      | `npm install -g pnpm`                                                              |
| Docker Desktop | any     | Local Postgres, Redis and email (`docker-compose.yml`). On Windows it needs WSL 2. |

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm services:up   # Postgres, Redis and email (Mailpit) in Docker
pnpm db:deploy     # apply database migrations
pnpm db:seed       # reference data (plans)
pnpm dev
```

- Web app: http://localhost:3000 (health check: http://localhost:3000/api/health)
- The worker runs in the same terminal and records a heartbeat in Redis every minute.
- Local email inbox (from Phase 3): http://localhost:8025

## Scripts

| Command                   | What it does                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                | Web app + worker with live reload                                                        |
| `pnpm check`              | Everything CI runs except build and e2e: format, types, lint, all tests                  |
| `pnpm test`               | Unit + integration tests (integration needs `pnpm services:up`)                          |
| `pnpm test:unit`          | Unit tests only; no Docker needed                                                        |
| `pnpm test:integration`   | Tests against real Postgres and Redis, using a separate `dpost_test` database            |
| `pnpm test:e2e`           | End-to-end tests (first run `pnpm --filter @dpost/web exec playwright install chromium`) |
| `pnpm build`              | Production builds of web (Next.js standalone) and worker (bundled `dist/`)               |
| `pnpm db:migrate`         | Create a new migration after editing `packages/db/prisma/schema.prisma`                  |
| `pnpm db:deploy`          | Apply pending migrations                                                                 |
| `pnpm db:seed`            | Insert reference data (idempotent)                                                       |
| `pnpm db:studio`          | Browse the database in Prisma Studio                                                     |
| `pnpm services:up`/`down` | Start or stop the Docker services                                                        |
| `pnpm format`             | Format all files with Prettier                                                           |

## Repository layout

```
apps/
  web/        Next.js 16: marketing site, dashboard, API routes
  worker/     Background jobs (publishing, AI generation, sync)
packages/
  config/     Environment variable validation (zod)
  core/       All business logic: services, AI, social adapters (framework-free)
  db/         Prisma schema, migrations, tenant-isolation guard
docs/         Architecture blueprint and roadmap
test/         Shared integration-test setup
```

## Tenant isolation

Every workspace-owned table has a `workspaceId`. Services receive a database client bound to the current workspace (`ctx.db`): it adds the workspace to every query and refuses queries that name another workspace. The default client (`getDb()`) throws on any workspace-owned query that doesn't name a workspace. Only auth, audit, admin and system code may use `getUnscopedDb()`. See [`packages/db/src/tenant.ts`](packages/db/src/tenant.ts).

## Environment variables

All variables are declared and validated in [`packages/config/src/env.ts`](packages/config/src/env.ts); the apps refuse to start with an invalid configuration. For local development, the apps and Prisma read the single `.env` file at the repo root. In staging and production, set variables in the host's dashboard. Never commit `.env`.

## Deployment (Railway)

The deployment is defined in code in [`.railway/railway.ts`](.railway/railway.ts): the `web` and `worker` services, Postgres and Redis, all in **Singapore** (`asia-southeast1`), the closest region to Bangladesh.

```bash
railway config plan     # preview changes, touches nothing
railway config apply    # apply them
```

Staging: **https://web-production-6737e.up.railway.app**

| Service  | Dockerfile          | Notes                                                                     |
| -------- | ------------------- | ------------------------------------------------------------------------- |
| `web`    | `Dockerfile.web`    | Railway assigns the port (8080); the service domain must target that port |
| `worker` | `Dockerfile.worker` | No public port                                                            |

Notes:

- **Migrations run automatically.** Before a new version takes traffic, Railway runs `sh /app/migrate.sh` from the web image, which applies pending migrations and inserts missing plans. Both steps are safe to repeat and never overwrite existing rows.
- **Secrets are never in the repo.** Set them once, and the config file keeps them with `preserve()`:
  ```bash
  railway variables --service web --set-from-stdin BETTER_AUTH_SECRET
  ```
- **`PORT` is reserved by Railway** and cannot be set as a variable. Point the domain at the port the app reports in its logs: `railway domain update <domain> --port 8080 --service web`.
- **Email is not configured yet.** The staging service runs with `ALLOW_MISSING_SMTP=true`, so confirmation and password-reset emails are **not sent**; the server logs a warning at startup. Set `SMTP_URL` (Resend) and remove that flag before real users sign up.
- **Google sign-in** needs the deployed domain added to the OAuth client in Google Cloud Console, as an authorized origin and with `<domain>/api/auth/callback/google` as a redirect URI.
