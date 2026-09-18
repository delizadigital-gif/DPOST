# DPOST — MVP Architecture & Development Blueprint

> **DPOST** ("Daily Post"), a product of **DelizaDigital**.

**Status:** Blueprint only. No application code has been written yet. Implementation starts when you say so, phase by phase.

## One-sentence product

A business owner connects their Facebook Page, tells the AI what they want in plain English, Bangla or Banglish, and the AI plans, writes, illustrates, schedules and publishes the content. The owner only reviews and approves.

## Core loop (the only thing the MVP must prove)

```
CONNECT → UNDERSTAND → CREATE → REVIEW → SCHEDULE → PUBLISH
```

## Documents

| #   | Document                                                 | Covers                                                                                    |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | [Product architecture](01-product-architecture.md)       | Part 1 system overview, Part 2 feature tiers, Part 3 user journey                         |
| 2   | [Technical architecture](02-technical-architecture.md)   | Part 4 stack decisions with reasons, runtime topology, queue, storage, auth, billing      |
| 3   | [Database schema](03-database-schema.md)                 | Part 5 entities, relationships, full Prisma schema draft                                  |
| 4   | [API architecture](04-api-architecture.md)               | Part 6 routes, server actions, webhooks, error model                                      |
| 5   | [AI architecture](05-ai-architecture.md)                 | Part 7 prompts, context, brand memory, generation pipeline, agent, tools, guardrails, MCP |
| 6   | [UI/UX architecture](06-uiux-architecture.md)            | Part 8 design system, screen hierarchy, key screens                                       |
| 7   | [Roadmap & MVP definition](07-roadmap.md)                | Part 9 phases, Part 10 must-have vs. wait                                                 |
| 8   | [Facebook integration notes](08-facebook-integration.md) | Credentials, permissions, App Review, hard API limits                                     |
| 9   | [Security, errors & testing](09-quality-security.md)     | Security checklist, failure-handling matrix, test strategy                                |

## The 12 decisions that shape everything

| #   | Decision                                                                                                                        | Why                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Modular monolith**: one Next.js app plus one worker process, sharing a `core` service layer                                   | One developer, one codebase, one deploy pipeline. The worker exists only because publishing and bulk AI work can't live inside HTTP requests.                                                         |
| 2   | **Service layer is the only path to the database**                                                                              | The UI, the REST API, the AI tools and (later) the MCP server all call the same functions, so authorization and validation live in exactly one place.                                                 |
| 3   | **PostgreSQL + Prisma**                                                                                                         | Relational data (tenants → accounts → posts → schedules) with strong migrations. Prisma's single schema file suits a solo developer better than Drizzle's flexibility does.                           |
| 4   | **Better Auth** for user auth, **separate** Facebook OAuth for page connections                                                 | "Log in with Facebook" and "let us publish to your Page" have different scopes, token lifecycles and failure modes. Coupling them causes subtle bugs.                                                 |
| 5   | **BullMQ + Redis** for jobs                                                                                                     | Durable delayed jobs, retries with backoff, and concurrency control. Redis also serves as the rate limiter and cache, so it's one dependency with three uses.                                         |
| 6   | **Cloudflare R2** for media                                                                                                     | S3-compatible with zero egress fees. An image-heavy product would otherwise pay mostly for bandwidth.                                                                                                 |
| 7   | **Provider interfaces** for LLM, image, social and payment                                                                      | Each is one TypeScript interface plus adapters. The default LLM is Claude, but no feature imports a vendor SDK directly.                                                                              |
| 8   | **Content plans are generated in 3 stages: LLM strategy → deterministic scheduler → batched LLM writing**                       | LLMs are bad at date math, ratio constraints and avoiding self-repetition across 150 posts. Code enforces the structure, and the LLM writes.                                                          |
| 9   | **AI tools are thin wrappers over services**, and `workspaceId` is always injected from the session, never taken from the model | This stops prompt injection or hallucination from reaching another tenant's data.                                                                                                                     |
| 10  | **Two-step confirmation tokens** for destructive or bulk tool calls                                                             | The model can _propose_ "delete 12 posts", but only a signed, short-lived token bound to the exact arguments, created when the user clicks, can execute it.                                           |
| 11  | **MCP is an adapter, not the backbone**                                                                                         | In-app tools are in-process function calls, and wrapping them in MCP adds latency with no benefit. MCP is valuable later as a public surface for external agents and for consuming third-party tools. |
| 12  | **Bangla text on images is composited by us, not drawn by the image model**                                                     | Current image models render Bengali script unreliably. We generate the background image, then overlay text with a font we control.                                                                    |

## Biggest external risk: Meta App Review

Publishing to Facebook Pages requires Meta **Business Verification** plus **App Review** for `pages_manage_posts` and related permissions. This can take weeks and may need resubmission. **Start it in Phase 1, not Phase 6.** Until approval, only people with roles on your Meta app can connect Pages. That covers development and a closed beta, but not public launch. Details: [08-facebook-integration.md](08-facebook-integration.md).
