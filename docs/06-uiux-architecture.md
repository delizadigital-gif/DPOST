# 06 — UI/UX Architecture (Part 8)

> Inspired by the _qualities_ of Loom's design language: confident type, calm whitespace, soft rounded surfaces, restrained purple-leaning gradients and friendly illustration. **Nothing is copied:** colors, type, layouts, illustrations and components below are original to DPOST.

## 8.1 Design principles

1. **Calm, then clear.** Lots of whitespace, one focal point per screen, one primary button.
2. **AI is a colleague, not a gimmick.** AI actions use one consistent visual signature (the "spark" gradient chip). They're never scattered sparkles everywhere.
3. **Show state honestly.** Every post always shows exactly where it is (draft → review → approved → scheduled → published / failed).
4. **Bangla-ready typography.** Every text style is tested in Bengali script, which needs more line height and has taller ascenders and descenders.
5. **Motion explains, it doesn't decorate.** Animations show causality (a post flying into a calendar slot) and last 150–250 ms. `prefers-reduced-motion` is fully respected.

## 8.2 Design tokens (original palette)

| Token              | Light                                                            | Dark              | Use                                                   |
| ------------------ | ---------------------------------------------------------------- | ----------------- | ----------------------------------------------------- |
| `--brand-600`      | `#5B3DF5` (DPOST Indigo)                                         | `#7B63FF`         | Primary buttons, links, focus                         |
| `--brand-50`       | `#F3F0FF`                                                        | `#1E1840`         | Selected states, AI surfaces                          |
| `--accent-coral`   | `#FF6B4A`                                                        | `#FF7D60`         | Highlights, marketing accents, "Live/Published" pulse |
| `--accent-mint`    | `#12B886`                                                        | `#2FD3A0`         | Success, published                                    |
| `--accent-amber`   | `#F5A524`                                                        | `#FFB84D`         | Needs review, warnings                                |
| `--danger`         | `#E5484D`                                                        | `#FF6369`         | Failed, destructive                                   |
| `--ink-900`        | `#14121F`                                                        | `#F4F3F8`         | Headings                                              |
| `--ink-600`        | `#57546A`                                                        | `#A9A6BA`         | Body secondary                                        |
| `--surface`        | `#FFFFFF`                                                        | `#121019`         | Cards                                                 |
| `--canvas`         | `#FAF9FD`                                                        | `#0B0A10`         | App background (a hint of violet, never pure grey)    |
| `--border`         | `#ECEAF3`                                                        | `#262334`         | Hairlines                                             |
| **Spark gradient** | `linear-gradient(135deg, #5B3DF5 0%, #A155F7 55%, #FF6B4A 100%)` | same, 90% opacity | **Only** on AI affordances + hero moments             |

Status colors map 1:1 to the post badge: Draft (ink-400), AI generated (brand), Needs review (amber), Approved (brand-600 outline), Scheduled (brand solid), Publishing (brand + shimmer), Published (mint), Failed (danger).

## 8.3 Typography

| Role                   | Latin                       | Bengali                   | Size / line-height (desktop) |
| ---------------------- | --------------------------- | ------------------------- | ---------------------------- |
| Display (marketing)    | **Bricolage Grotesque** 700 | **Hind Siliguri** 700     | 64/68 → 40/44 mobile         |
| H1                     | Bricolage Grotesque 600     | Hind Siliguri 600         | 32/40                        |
| H2                     | Inter 600                   | Hind Siliguri 600         | 24/32                        |
| H3                     | Inter 600                   | Hind Siliguri 600         | 18/28                        |
| Body                   | **Inter** 400               | **Noto Sans Bengali** 400 | 15/24 (Bengali: 15/26)       |
| Small / meta           | Inter 500                   | Noto Sans Bengali 500     | 13/20                        |
| Mono (rare: IDs, logs) | JetBrains Mono              | —                         | 13/20                        |

All fonts are open-source (Google Fonts) and self-hosted via `next/font` (no layout shift, no third-party request). The font stack is set per `lang` attribute so mixed Bangla/English text in one caption renders each script in its own font.

## 8.4 Shape, spacing, elevation, motion

- **Radius:** 8 (inputs, chips), 12 (buttons, small cards), 16 (cards), 24 (modals, hero panels), full (avatars, pills).
- **Spacing:** 4-pt scale. Card padding 20–24, section gaps 32–48 in the app and 96–128 on marketing.
- **Elevation:** mostly borders. Shadows only for floating layers (`0 8px 24px -8px rgb(20 18 31 / 0.12)`).
- **Motion:** `ease-out-quint` for entrances, 180 ms. Page transitions are a subtle 8px fade-up between dashboard sections. Hover lifts cards by 1px with a border tint. The skeleton shimmer uses brand-50.
- **Illustration style:** simple geometric scenes (rounded blobs, phone/calendar/speech bubble shapes) in brand palette with soft grain. The recurring mascot motif is a small four-point spark, used for empty states and onboarding. (Commissioned or generated, but ours.)

## 8.5 Component inventory (built on shadcn/ui primitives)

**Foundation:** Button (primary / secondary / ghost / danger / spark-AI), Input, Textarea (auto-grow + char counter), Select, Combobox, DatePicker, TimePicker, Tabs, Dialog, Sheet (mobile drawers), Popover, Tooltip, DropdownMenu, Toast (sonner), Badge, Avatar, Skeleton, EmptyState, Stepper, Progress, Switch, Chips/TagInput, Kbd.

**Domain:**
`PostCard` (compact / full) · `StatusBadge` · `ChannelAvatar` (platform glyph overlay) · `CalendarMonth` / `CalendarWeek` / `PostList` · `ComposerPanel` · `FacebookPreview` (original rendering of a feed post, not a Facebook UI clone) · `MediaTile` / `MediaPicker` · `BrandSectionCard` (with provenance tag) · `MemoryChip` · `StrategyCard` · `ConfirmActionCard` · `TaskProgressCard` · `ChatMessage` / `ChatComposer` / `ToolStatusChip` · `MetricTile` · `SparkButton` · `QuotaMeter` · `NotificationBell`.

## 8.6 Screen hierarchy

```
Marketing (public)
├─ /                     Landing
├─ /pricing
├─ /privacy  /terms  /data-deletion         ← required for Meta App Review
│
Auth
├─ /signup   /login   /forgot   /reset   /verify
│
Onboarding  (full-screen, no sidebar)
├─ /welcome/business → /welcome/audience → /welcome/voice → /welcome/connect → /welcome/pages
│
App  (sidebar shell)
├─ /home                 Overview
├─ /assistant            AI Assistant  (/assistant/[conversationId])
├─ /content              All posts (list + filters + bulk)   /content/plans/[id]
├─ /calendar             Month | Week | List
├─ /create               Composer   (/create?post=[id] to edit)
├─ /channels             Social accounts
├─ /media                Media library
├─ /brand                Brand Brain
├─ /analytics
├─ /notifications
└─ /settings             /account /workspace /ai /notifications /billing
│
Admin
└─ /admin                /users /workspaces /failures /ai-usage /queues
```

**Navigation:** a left sidebar (collapsible to icons on laptop, becoming a bottom tab bar + "More" sheet on mobile) grouped as:

- **Create:** Assistant ✦, Create post
- **Plan:** Calendar, Content
- **Library:** Media, Brand Brain
- **Grow:** Analytics
- **Setup:** Channels, Settings

At the bottom: quota meter, workspace name, avatar. The mobile tab bar holds Home · Calendar · **✦ Assistant (center, raised)** · Content · More.

**A global ⌘K / "Ask AI" bar** is reachable from every screen. It opens the assistant as a right-side sheet that keeps page context ("Make _this_ post more engaging" knows which post is open).

## 8.7 Key screens

### Landing page (`/`)

1. **Nav:** logo, Product, Pricing, FAQ, Log in, **Start free**.
2. **Hero:** Headline options (original):
   - _"Say what you want to post. DPOST plans it, writes it and posts it."_
   - _"Your social media, handled by an AI teammate."_
   - Bangla sub-line option: _"আপনি বলুন কী চান, বাকিটা আমরা করবো।"_

   Below the headline is a live demo: a chat input "types" a prompt ("Plan 2 weeks of posts for my saree shop, Eid offer focus"), then the calendar on the right fills with post cards one by one, with images fading in. A CTA pair: **Start free**, Watch 60-sec demo.

3. **Logos/social proof strip** (placeholder until real customers exist; never fabricated).
4. **How it works:** 3 steps with illustrations: _Connect your Page → Tell the AI your goal → Review & relax_.
5. **AI features:** bento grid: Content plans, Brand Brain, Image generation with Bangla text, Bangla/Banglish, Smart scheduling.
6. **Calendar showcase:** interactive mini calendar (hover a post to see the preview).
7. **AI assistant showcase:** scripted chat replay showing tool chips ("Checking your Page… Writing 10 posts… Scheduling…").
8. **Benefits:** Save 10+ hrs/week (framed as illustrative, not as a claim), post consistently, sound like yourself.
9. **Example workflow:** a timeline of a bakery owner's week.
10. **Pricing:** 4 tiers in BDT (৳) with a monthly/yearly toggle. Currency auto-switches to USD for non-BD visitors later.
11. **FAQ:** "Can it post to my personal profile?" (honest: no, Pages only), "Is my Page safe?", "Do I need to know AI?", "Bangla support?", "Cancel anytime?"
12. **Final CTA** band with the spark gradient.
13. **Footer:** product, legal, contact, language switch.

Performance budget: LCP < 1.5 s on 4G, hero demo animation JS lazy-loaded after paint, and the page statically generated.

### Overview (`/home`)

```
┌─────────────────────────────────────────────────────────────────┐
│ Good evening, Rahim 👋                         [✦ Ask AI…      ]│
│ ┌──────────── AI prompt box (big) ──────────────────────────┐   │
│ │ What should we post this week?                             │   │
│ │ [Plan next 7 days] [Promote a product] [Post for today]    │   │
│ └────────────────────────────────────────────────────────────┘   │
│ ┌ Needs your review (6) ─────┐ ┌ Up next ──────────────────────┐ │
│ │ [post][post][post] →       │ │ Today 8:00 PM  Eid offer…  ●  │ │
│ └────────────────────────────┘ │ Tomorrow 1:00 PM  Tip…     ●  │ │
│ ┌ This week ──┐┌ Published ──┐┌ Engagement ┐ └──────────────────┘ │
│ │ 14 scheduled││ 23 this mo. ││ +18% ▲     │ ┌ AI suggestions ──┐ │
│ └─────────────┘└─────────────┘└────────────┘ │ "Tips get 2× more│ │
│ ┌ Channels: [FB Rahim's Kitchen ✓] [+ Add] ┐ │ comments. Plan 3?"│ │
│ └──────────────────────────────────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Priority order: the **review queue** first (it unblocks publishing), then upcoming posts, stats and suggestions. Failed posts, if any, appear as a red banner above everything.

### AI Assistant (`/assistant`)

- A ChatGPT-familiar layout: a conversation list (collapsible) on the left, the thread in the center, and a **context panel** on the right on wide screens (the brand at a glance, channel, and a mini calendar of what the AI touched this conversation).
- The empty state shows 6 starter prompts in the user's language, plus a note: "I can create, edit, schedule and publish posts. I'll always ask before deleting or publishing."
- The message stream interleaves text, **tool chips** (animated while running, check-marked when done), and **rich cards**: strategy, post list (each post with inline Edit/Regenerate/Remove), confirmation, progress, calendar snippet.
- The composer has multiline input, a 🎙 voice input (post-MVP, and valuable for BD mobile users), and an attach image button.

### Calendar (`/calendar`)

- A toolbar with Today, ‹ ›, the date label, a view switcher (Month / Week / List), channel and status filters, and **✦ Fill with AI** (opens the plan wizard pre-filled with the visible range).
- **Month:** day cells show up to 3 compact post chips (time + thumbnail + status dot) and "+N more".
- **Week:** time-grid columns with post cards at their times, and a red "now" line.
- **List:** grouped by day, full previews, and bulk select.
- Clicking a post opens a **right-side sheet** (not a page navigation) with a preview and actions: Edit, Regenerate ✦, Add image ✦, Approve, Reschedule, Duplicate, Delete. Unscheduled plan posts show in a "Not yet scheduled" tray.
- Drag-and-drop is post-MVP (`@dnd-kit`, with keyboard-accessible fallback).

### Composer (`/create`)

Split layout: the **editor** on the left (channel picker, text with char counter + ✦ toolbar [Write / Improve / Shorten / Translate / Add CTA / Hashtags], media strip, hashtags chips, CTA, date + time with a "Best time" suggestion), and a **live preview** on the right (an original feed-card rendering). Validation messages appear inline ("Facebook link previews only show when the post has no image"). The footer holds Save draft · Schedule ▾ (Schedule / Publish now). On mobile the preview becomes a toggle tab.

### Brand Brain (`/brand`)

Cards for Business, Products & services, Audience, Voice, Content pillars (weights as a stacked bar), Preferences, and **Memories** (a chip list, each with source + delete). Each field shows a provenance tag: _You_ · _Onboarding_ · _Learned from your Page_. There's a "Re-analyze my Page" button, and "Test my voice ✦" generates 3 sample posts live so the user can see how the profile translates into content.

### Channels (`/channels`)

Account cards show Page avatar, name, status (Connected / Needs reconnect / Revoked), last sync, and a toggle for "use for publishing". A "Needs reconnect" card has one big **Reconnect** button. Upcoming platforms are shown as "Coming soon" cards, which also doubles as demand validation (a "Notify me" click is logged).

### Media (`/media`)

A masonry grid, filters (All / Uploaded / AI / Brand assets), search, a drag-and-drop upload zone, and a detail sheet (preview, alt text, tags, used in N posts, Download, Delete). "✦ Generate image" opens a prompt dialog with style presets (Photo, Flat illustration, Festive, Minimal product, Bold offer banner).

### Analytics (`/analytics`)

Range selector (7/30/90 days). Metric tiles show only what the API returns, and unavailable metrics show "—" with a tooltip explaining why. There's an engagement trend line, a **Top posts** table, a content-type performance bar chart, and a posting frequency heat strip. An "✦ Explain my results" button produces a plain-language summary.

### Settings (`/settings`)

A tabbed page: Account · Workspace · AI defaults · Notifications · Billing (plan card + quota meters + "Upgrade: contact us" in the MVP).

## 8.8 States (every screen, every component)

| State   | Pattern                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Loading | Skeletons matching the final layout (no spinners on page loads)                                                                 |
| Empty   | Illustration + one sentence + primary action + ✦ AI alternative ("No posts yet. **Plan my week with AI**, or create one")       |
| Error   | Inline card: what happened (plain words) + what to do + Retry. The request ID is shown under a "Details" disclosure for support |
| Partial | e.g. "12 of 14 posts generated. 2 failed: [Retry]"                                                                              |
| Offline | Top banner. Drafts in the composer autosave to localStorage                                                                     |
| Success | Toast with Undo where the action is reversible (delete, reschedule, AI edit)                                                    |

## 8.9 Accessibility & responsiveness

- WCAG 2.2 AA contrast (checked for both themes), visible focus rings (2px brand + offset), full keyboard support for calendar, dialogs and menus, `aria-live` for streaming chat and toasts, and form errors linked via `aria-describedby`.
- Hit targets ≥ 44 px on touch.
- Breakpoints: `sm 640` (mobile layouts), `md 768` (tablet: sidebar collapses), `lg 1024` (laptop: full sidebar), `xl 1280` (the assistant context panel appears).
- Mobile: the calendar defaults to **List**, the composer is single column, and sheets replace side panels.
- Light theme by default, with dark theme supported through tokens (a toggle in settings plus a system preference).
