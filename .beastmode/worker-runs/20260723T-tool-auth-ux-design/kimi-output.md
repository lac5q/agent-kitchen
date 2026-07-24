## 1. Page layout (ASCII wireframe)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ < PageHeader                                                                │
│   title: Connected Tools                                                    │
│   description: Manage OAuth and API-key connections to third-party tools.   │
│   action: [? tooltip]                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Usage meter] 8 of 10 connections used          [Upgrade Nango plan →]       │
│ [Recent activity strip] Last 5 events: Slack connected • GitHub revoked …   │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Search providers…]                    [Filter: All ▼]  [Show expired only] │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ Productivity                                          (3)                   │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐                             │
│ │ Slack  ●   │  │ Notion     │  │ Google     │                             │
│ │ Connected  │  │ Connect →  │  │ Drive      │                             │
│ └────────────┘  └────────────┘  └────────────┘                             │
│ Developer Tools                                       (2)                   │
│ ┌────────────┐  ┌────────────┐                                              │
│ │ GitHub ⚠   │  │ Circleback │                                              │
│ │ Error      │  │ Connect →  │                                              │
│ └────────────┘  └────────────┘                                              │
│ CRM / Finance / Other …                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
  ↑ OAuth/API-key forms open in a Sheet anchored to the right edge of the viewport.
  ↑ Revoke confirmation opens in a destructive Sheet (or same Sheet variant).
  ↑ Connection limit upgrade CTA opens external Nango billing page in new tab.
```

Zones where modals/sheets open:
- **Connect action (OAuth):** opens a small Nango authorization popup/new tab; no in-app modal. Return state handled via `postMessage` to the original tab.
- **Connect action (API key):** opens a **Sheet** (`<ProviderApiKeySheet />`) from the right.
- **Revoke action:** opens a **Sheet** (`<RevokeConnectionSheet />`) from the right with destructive styling.
- **Rotate token / copy connection ID:** inline buttons on the card; no sheet.

---

## 2. Provider card states

### Not connected
- **Visual:** provider icon (Lucide, 24px), name, short description (e.g., “Post messages and read channels”), category chip. Primary CTA is `Btn` with label **Connect** and right chevron.
- **Badges:** none, or a subtle neutral `badge` variant reading **Not connected**.
- **Hover/active:** card background shifts from `bg-background` to `bg-muted/40`; CTA background darkens; `transition-colors duration-150`.
- **Accessibility:** card is a `<button>` or has a clearly labeled CTA; focus ring on the CTA only (avoid wrapping the whole card in a focusable element). Screen-reader label: “Connect Slack, OAuth.”
- **Empty state (no providers in a category):** the entire category section collapses. Do not show a heading with zero cards.

### Connected
- **Visual:** provider icon, name, status row with green `badge` **Connected**, account email (e.g., `ops@example.com`), scope summary (e.g., “channels:read, chat:post”), and a **Last used** timestamp (e.g., “2 min ago”). Below: connection ID (truncated, e.g., `nango_conn_abc…xyz`) with copy-to-clipboard icon, **Rotate** button, **Revoke** button.
- **Badges:** `badge` variant `success` (or `default` with `text-emerald-600` token).
- **Hover/active:** card lifts slightly; action buttons reveal tooltips. Copy button shows “Copied” for 1.5s after click.
- **Accessibility:** status badge has `aria-label="Connected to Slack as ops@example.com"`. Connection ID copy button announces “Connection ID copied.”

### Expired
- **Visual:** same as Connected but badge is **Expired** with `warning` token (amber). Body copy: “Re-authorization required — token expired 6 hours ago.” CTA is **Reconnect**.
- **Micro-interactions:** badge pulses gently with a 2s loop (`animate-pulse` or custom subtle opacity pulse) to signal urgency without panic.
- **Hover/active:** CTA becomes more prominent; hover state shifts background to `bg-warning/5`.
- **Accessibility:** badge `aria-label="Expired, re-authorization required"`. Focus first lands on **Reconnect**.

### Error
- **Visual:** badge **Error** with `destructive` token (red). Body copy: “Connection failed: invalid grant.” CTA: **Retry** (secondary) and **Revoke** (destructive ghost). If the provider exposes an error code from Nango, show it in a monospace tooltip.
- **Hover/active:** card border changes to `border-destructive/50`.
- **Accessibility:** `aria-live="polite"` region announces the error when it appears. Badge `aria-label="Connection error, retry or revoke"`.

### Loading
- **Visual:** card shows a skeleton: icon placeholder (circle), two lines of text, and a button placeholder. Use shadcn-style skeletons via `Card` with `animate-pulse` bg.
- **Empty state:** when a category is still loading, show a single skeleton row for the whole section rather than per-card placeholders to reduce layout thrash.
- **Accessibility:** `aria-busy="true"` on the grid; `aria-label="Loading providers"`.

---

## 3. OAuth connect flow

1. **Click Connect.** The button enters a loading state (`Btn` loading). The app calls `POST /api/tools/connect` with `providerKey=slack`. The backend returns a Nango authorization URL.
2. **Open redirect.** Open the URL in a new tab (or centered popup 600×700). Do **not** use an iframe or modal.
3. **Return handshake.** On completion, the Nango callback posts a message back to the opener (`window.opener.postMessage` or tab-level `broadcastchannel` fallback). The frontend receives `{ providerKey, connectionId, status }`.
4. **Close popup.** The app closes the popup if it is still open and refetches `connections` via React Query.
5. **Success toast.** `Toast` message: “Slack connected as ops@example.com.” Card transitions to Connected state.
6. **Error toast.** If the user denies consent or Nango errors, show: “Could not connect Slack. Nango returned: invalid_credentials.” Provide a **Retry** action.
7. **Token expiry countdown.** For short-lived access tokens, show a subtle line: “Access token expires in 47 min.” When < 5 min, change to `warning` color. The backend refreshes automatically in the background; if refresh fails, the card switches to **Expired**.
8. **Re-auth flow.** Expired cards trigger the same redirect. Re-auth preserves the existing Nango connection ID where possible; backend updates vault entry rather than creating a new connection.

---

## 4. API-key connect flow

**Decision: dedicated Sheet.** API keys have variable fields and need focused validation. A sheet keeps the grid uncluttered and matches the `api-keys/page.tsx` pattern of in-page forms inside drawers/sheets.

**Sheet contents:**
- Header: provider icon + name + “Connect with API key”.
- Body: dynamic fields from the provider registry (e.g., **API key**, **Workspace ID**, **Base URL**). Each field has a label and help text.
- Footer: **Test connection** (secondary), **Save** (primary), **Cancel** (ghost).

**Field validation rules:**
- API key: required, min 8 chars, trimmed. Show error if empty or only whitespace.
- Workspace ID / subdomain: required only for providers that need it (e.g., Notion). Validate against provider-specific regex (e.g., lowercase + dashes).
- Base URL: optional; if provided, must be a valid URL.
- Zod schema: `apiKeyFormSchema` per provider, generated from the registry config.

**Test connection step:** required. Clicking **Test connection** sends the credentials to a backend endpoint that makes a lightweight API call (e.g., `GET /users/me`). Do not save on test. Show inline result: green check “Connection verified” or red inline error “Authentication failed: invalid token.”

**Key visibility:**
- Toggle button with `Eye` / `EyeOff` icon.
- Input type toggles between `password` and `text`.
- Paste-to-fill works normally; no custom handling needed.
- Copy-from-clipboard: only if the user chooses to paste an existing key.

**Save behavior:** On success, close sheet, show toast “GitHub API key saved.” Refetch connections. On vault write failure, show error in sheet footer and keep the sheet open so the user can retry.

---

## 5. Revocation flow

**Trigger:** The **Revoke** button on a connected card. Always open a confirmation sheet, never a one-click revoke.

**Confirmation sheet copy:**
- Title: “Revoke Slack connection?”
- Body: “This removes memroos’s access token from the vault. Any agents using Slack will stop immediately. The Nango connection record will be deleted. This action is logged in the audit log.”
- Connection ID: show in monospace, copyable, for support.
- Footer: **Cancel** (ghost), **Revoke connection** (destructive `Btn`).

**Destructive button styling:** Use `variant="destructive"` on the shared `Btn` or `button` primitive. Disable while the mutation is pending.

**What clears:**
- AES-256-GCM vault entry for this connection.
- Nango connection (via backend call).
- In-memory cached connection status.

**What stays:**
- Audit log event: `connection_revoked` with timestamp, provider, operator identity, and masked connection ID.
- Provider registry entry remains visible so the card returns to **Not connected**.

**Success toast:** “Slack connection revoked.”
**Error toast:** “Could not revoke Slack. Refresh and try again.”

---

## 6. Category + visual hierarchy

Categories are grouped in this order:

1. Productivity — Slack, Notion, Google Drive, Microsoft 365
2. Developer Tools — GitHub, Linear, Circleback
3. CRM — HubSpot
4. Finance — QuickBooks, Stripe
5. Other — any custom providers

**Color/icon system (neutral):**
- Category icons are monochromatic Lucide icons at `text-muted-foreground`.
- Productivity: `Layers` or `LayoutGrid`
- Developer Tools: `Code2`
- CRM: `Users`
- Finance: `Banknote`
- Other: `Box`

**Status badge color tokens:**
Use the existing `base-nova` tokens only:

| Status | Badge variant | Background | Text |
|---|---|---|---|
| Connected | `success` | `bg-emerald-500/10` | `text-emerald-600` |
| Expired | `warning` | `bg-amber-500/10` | `text-amber-600` |
| Error | `destructive` | `bg-red-500/10` | `text-red-600` |
| Not connected | `secondary` | `bg-muted` | `text-muted-foreground` |
| Loading | `outline` | skeleton | skeleton |

Do not introduce new color tokens.

---

## 7. Empty / loading / error states

### First-run (zero connections)
- Hide the recent activity strip entirely.
- Show a neutral empty card at the top of the grid: “No tools connected yet. Choose a provider above to connect via OAuth or API key.”
- Keep the search and category grid visible so the user can act immediately.

### Nango API failure
- If the provider registry fails to load: show a full-page error card with title “Could not load connected tools” and a **Retry** button that refetches.
- If only the connection status fails: show an inline banner below the header: “Connection status unavailable. Check the Nango integration key.”

### Vault write failure
- Rare. Show an inline sheet error: “Could not save credentials to the vault. Check `MEMROOS_VAULT_KEY_PATH` and disk permissions.”
- Do not close the sheet. Disable the primary save button until the user edits a field.

### Search/filter empty
- If the user searches and no providers match, show a centered message: “No providers match ‘qb’. Clear search.”

---

## 8. Responsive behavior

Breakpoints align with Tailwind defaults:

- **Mobile (< 640px):** single-column cards, full-width sheets, header actions stacked below the description. Recent activity strip becomes a vertical list. Search bar takes full width.
- **Tablet (640px–1024px):** 2-column grid, sheet width 400px, header actions in one row.
- **Desktop (> 1024px):** 3-column grid, sheet width 480px, usage meter and recent activity strip side by side in a single row.

Only change to the wireframe: on desktop, usage meter and recent activity are in a horizontal flex row; on mobile, they stack vertically.

---

## 9. Motion + micro-interactions

- **Page-load fade-in:** the entire grid fades in with `opacity-0 → opacity-100` over 200ms, staggered 20ms per category.
- **Card hover lift:** `transition-transform hover:-translate-y-0.5 duration-150` plus `shadow-sm hover:shadow-md`.
- **Status badge pulse for Expired:** subtle opacity animation `0.7 → 1 → 0.7` over 2s, infinite. Use Tailwind `animate-pulse` or a custom keyframe limited to the badge only.
- **Optimistic update:** when the user clicks **Connect**, immediately set the card to a loading state with the provider name; when the mutation resolves, swap to Connected or Error. For revocation, immediately gray out the card and set status to **Not connected**; roll back on error.
- **Toast entrance:** slide in from bottom-right, 200ms.

Avoid lengthy animations; keep all motion under 300ms.

---

## 10. Accessibility checklist

- **Keyboard nav order:** header → usage meter → search → first category heading → first card CTA → next card → recent activity. Use `tabIndex` only where necessary.
- **ARIA labels for status badges:** every badge reads the full status (e.g., “Connected to Slack as ops@example.com”).
- **Color contrast:** status text colors must hit 4.5:1 against `bg-background`. Use the existing `base-nova` foreground tokens, which are already contrast-checked.
- **Focus management on sheet open/close:** focus moves to the first focusable element in the sheet on open; on close, focus returns to the trigger button.
- **Screen-reader announcements:** use `aria-live="polite"` regions for toast-style success messages (“Slack connected”), revocation success, and OAuth errors.
- **Form labels:** every API key input has an associated `<label>`. Toggle key visibility button has `aria-label="Show API key" / "Hide API key"`.
- **Disabled buttons:** show `aria-disabled` and explain why via tooltip when a button is disabled due to connection limit.

---

## 11. Recommended copy

| Element | Copy |
|---|---|
| Page title | Connected Tools |
| Page description | Manage OAuth and API-key connections to third-party tools. |
| Usage meter | `{used} of {limit} connections used` |
| Upgrade CTA | Upgrade Nango plan |
| Search placeholder | Search providers… |
| Not connected badge | Not connected |
| Connected badge | Connected |
| Expired badge | Expired |
| Error badge | Error |
| Connect button | Connect |
| Reconnect button | Reconnect |
| Retry button | Retry |
| Revoke button | Revoke |
| Rotate button | Rotate token |
| Copy connection ID | Copy ID |
| Empty state | No tools connected yet. Choose a provider above to connect via OAuth or API key. |
| Revoke title | Revoke {provider} connection? |
| Revoke body | This removes memroos’s access token from the vault. Any agents using {provider} will stop immediately. |
| Revoke confirm | Revoke connection |
| Save API key | Save connection |
| Test connection | Test connection |
| OAuth success toast | {provider} connected as {account}. |
| OAuth error toast | Could not connect {provider}. {error}. |
| Revoke success toast | {provider} connection revoked. |
| Vault write error | Could not save credentials to the vault. Check `MEMROOS_VAULT_KEY_PATH`. |
| Nango load error | Could not load connected tools. Check the Nango integration key. |

Voice: direct, technical, no exclamation marks, no “Great!” or “Oops!”.

---

## 12. Implementation notes for the engineer

### Component breakdown
- `ConnectedToolsPage` — page shell, query providers, layout.
- `ConnectionUsageMeter` — usage bar + upgrade CTA.
- `RecentActivityStrip` — list of last 5 events.
- `ProviderSearchInput` — controlled input with debounce.
- `ProviderGrid` — category grouping and empty state.
- `ProviderCard` — card rendering based on status.
- `ConnectionStatusBadge` — badge + ARIA label.
- `OAuthConnectButton` — handles redirect/popup and return handshake.
- `ApiKeyConnectSheet` — dynamic form + test + save.
- `RevokeConnectionSheet` — destructive confirmation.
- `CopyToClipboardButton` — small reusable wrapper around copy action.

### Data flow
React Query keys:

- `['tools', 'providers']` — provider registry (static-ish, long cache).
- `['tools', 'connections']` — current connection statuses.
- `['tools', 'activity']` — recent activity log (staleTime 5s).

Mutation hooks:

- `useConnectOAuth({ providerKey })` — returns Nango URL, opens popup.
- `useConnectApiKey({ providerKey, values })` — posts form, invalidates connections.
- `useRevokeConnection({ providerKey, connectionId })` — destructive, invalidates connections and activity.
- `useRotateToken({ providerKey, connectionId })` — optional; re-fetches token.

### Optimistic update strategy
For revocation, call `queryClient.setQueryData(['tools','connections'], old => ...)` to remove the connection immediately, then run the mutation. Roll back on error.

For OAuth, show only local loading state; the actual connection is created server-side after the redirect, so refetch on `postMessage` return.

### Types
Define a `ProviderRegistry` type in `apps/memroos/src/types/tools.ts`:

```ts
export type ProviderAuthType = 'oauth' | 'apiKey';

export type Provider = {
  key: string;
  name: string;
  description: string;
  category: 'productivity' | 'developer' | 'crm' | 'finance' | 'other';
  authType: ProviderAuthType;
  icon: LucideIcon;
  apiKeyFields?: ApiKeyField[];
};
```

Use Zod for runtime validation of the API-key form: `const apiKeyFormSchema = z.object({ apiKey: z.string().min(8) })` per provider.

### i18n
If memroos has i18n, prefix keys under `settings.tools.*`. Example: `settings.tools.title`, `settings.tools.description`, `settings.tools.connectButton`. The engineer can defer i18n wrapping if the project is English-only today.

### Test plan
- **Unit:** render each card state; validate form schemas; assert copy-to-clipboard; test optimistic update rollback.
- **Playwright:** mock Nango redirect and assert success toast; open API key sheet, fill/test/save; revoke and confirm destructive action; verify connection limit UI at 9/10 and 10/10; test mobile responsive layout.

---

## 13. Anti-patterns to avoid

- **“Connect all” button:** do not batch-authorize providers. Each connection requires explicit consent and clear scope awareness.
- **Auto-refresh on visible state:** do not silently refresh tokens when the user is looking at the page. All token refreshes must happen in the background and surface only on failure.
- **Status icons that look like emojis:** use Lucide icons only. No 🟢/🔴/⚠️ glyphs.
- **Modal for OAuth redirect:** OAuth must happen in a new tab or popup, never an iframe or modal, to avoid security warnings and third-party cookie issues.
- **Loading skeleton forever:** every async state must resolve to data, empty, or error within 10 seconds. Add a timeout and a retry CTA.
- **Storing API keys in plain React state:** keys must be submitted directly to the backend and never retained in client state after the sheet closes.
- **Generic error messages:** always show the provider name and, when safe, the Nango error code. Avoid “Something went wrong.”
- **Color overload:** do not assign a unique brand color to each provider. The page is neutral; status colors are the only accents.
