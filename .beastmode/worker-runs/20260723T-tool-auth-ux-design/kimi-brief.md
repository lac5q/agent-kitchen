You are the design lead for the memroos Connected Tools settings page (Phase 179 / v8.23).

PROJECT CONTEXT

Memroos is a self-hosted, single-tenant-per-installation agent OS that exposes tools via MCP. It is a Next.js + shadcn/ui ("base-nova" style, neutral palette, lucide icons) + Tailwind + React Query app at `apps/memroos`. The existing settings page pattern lives at `apps/memroos/src/app/settings/api-keys/page.tsx` — read it for the design language, data flow, and component usage.

Phase 179 (v8.23) is shipping a "Connected Tools" page at `apps/memroos/src/app/settings/tools/page.tsx` that lets an operator connect memroos to third-party tools (Slack, Linear, Circleback, GitHub, Notion, HubSpot, QuickBooks, Google Drive, Stripe, Microsoft 365, ...) via OAuth or API-key. Authentication orchestration is via Nango (hosted Free tier for ≤10 connections per installation; paid tiers kick in above). Tokens live in memroos's AES-256-GCM vault (`MEMROOS_VAULT_KEY_PATH`).

REQUIREMENTS

The page must:
1. List all available providers as cards grouped by category (Productivity, Developer Tools, CRM, Finance, Other).
2. Show per-provider status: Not connected / Connected (with account email, scope summary, last-used timestamp) / Expired (re-auth needed) / Error (with retry CTA).
3. Support BOTH OAuth (redirect flow) AND API-key (in-page form). Detect which auth type per provider from the registry.
4. Have a search/filter input for when the catalog exceeds ~15 providers.
5. Have a "Recently connected" activity strip showing last 5 connect/revoke/refresh events.
6. Show the Nango connection-id + a "rotate token" action per connected provider.
7. Have a "Revoke" action that confirms in a destructive sheet/dialog before clearing the vault entry.
8. Have a "Connection limit" indicator: Nango Free tier is 10 connections; show "8 of 10 connections used" with upgrade CTA when near limit.
9. Use only components already in the memroos design system: `Btn`, `Card`, `PageHeader` from `@/components/shared/ui`; shadcn primitives (`badge`, `button`, `card`, `input`, `separator`, `sheet`, `tooltip`); lucide icons. Do NOT propose new dependencies.
10. Match the visual language of `apps/memroos/src/app/settings/api-keys/page.tsx` (rounded corners, neutral palette, dense information, copy-to-clipboard pattern, subtle motion).

OUTPUT — DELIVER A UX DESIGN SPEC WITH THESE SECTIONS:

## 1. Page layout (ASCII wireframe)
A single-screen wireframe showing the page structure: header, stats strip, search, category-grouped provider grid, recent activity. Mark zones where modals/sheets open from.

## 2. Provider card states
For each of the 5 states (Not connected / Connected / Expired / Error / Loading), describe:
- Visual: what fields, badges, icons, micro-interactions
- Hover/active states
- Accessibility (focus ring, screen-reader label)
- Empty state (no providers in a category)

## 3. OAuth connect flow
- Click "Connect" → what happens visually
- External redirect → return → success/error toast
- Token expiry countdown (when visible)
- Re-auth flow

## 4. API-key connect flow
- Inline form vs dedicated sheet — pick one and justify
- Field validation rules
- "Test connection" step or skip?
- Show/hide key toggle, paste-to-fill, copy-from-clipboard

## 5. Revocation flow
- Trigger, confirmation copy, destructive button styling
- What clears in the vault + what stays (audit log)

## 6. Category + visual hierarchy
- Color/icon system for categories (no rainbow — memroos is neutral palette)
- Status badge color tokens (use existing memroos tokens; do not invent new ones)

## 7. Empty / loading / error states
- First-run (zero connections, empty state that explains what to do first)
- Nango API failure (rate limit, expired key, network)
- Vault write failure (rare; what to show)

## 8. Responsive behavior
- Mobile (single column, cards stack), tablet (2-column), desktop (3-column grid). Note any changes to the wireframe.

## 9. Motion + micro-interactions
- Page-load fade-in
- Card hover lift
- Status badge pulse for "Expired" (urgency cue)
- Optimistic update pattern for connection/disconnection

## 10. Accessibility checklist
- Keyboard nav order
- ARIA labels for status badges
- Color contrast for status colors against neutral background
- Focus management on modal/sheet open/close
- Screen-reader announcements for connect success / revoke success / auth errors

## 11. Recommended copy
- Page title, description, CTA labels, error messages, empty state copy, success toasts. Voice: clear, technical, no marketing fluff.

## 12. Implementation notes for the engineer
- Component breakdown (one component per concern)
- Data flow: React Query keys, mutation hooks, optimistic update strategy
- Where to put types (Zod schema? inline?)
- i18n keys if memroos supports it
- Test plan (unit + Playwright)

## 13. Anti-patterns to avoid
- "Connect all" button — bad UX, hides what was actually authorized
- Auto-refresh on visible state without user awareness
- Status icons that look like emojis
- Modal for OAuth redirect (use new tab with postMessage return)
- "Loading skeleton forever" on connection status

DESIGN QUALITY BAR

This is the page a paying customer sees when they first set up memroos. It needs to feel premium, calm, and operationally clear — like Linear, Vercel, or Stripe dashboard pages. Not flashy. Not cute. Clear hierarchy, generous whitespace, obvious next actions, no surprises.

OUTPUT FORMAT

Return ONLY the design spec, no preamble. Use Markdown headings 1-13 as listed above. Be specific (real text, real values, real wireframe ASCII). Where you have an opinion, state it. Where you're deferring to the engineer, say so.

LENGTH

Target: 1500-2500 words. Be dense, not verbose.

Begin.