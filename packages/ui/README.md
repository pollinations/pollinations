# @pollinations_ai/ui

Internal UI primitives for Pollinations apps. SDK-backed subpaths consume auth
state from [`@pollinations_ai/sdk/react`](../sdk/README.md#react-auth-provider);
core primitives and display recipes stay SDK-free.

## Install

```bash
npm install @pollinations_ai/ui
```

Install `@pollinations_ai/sdk` too when using `@pollinations_ai/ui/*/sdk`
subpaths.

## Usage

```tsx
import "@pollinations_ai/ui/styles.css";
import { PolliProvider, useAccountKeyUsage } from "@pollinations_ai/sdk/react";
import { Surface } from "@pollinations_ai/ui";
import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations_ai/ui/auth/sdk";
import {
    Balance,
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
} from "@pollinations_ai/ui/wallet/sdk";

function RecentRequests() {
    const { data: usage } = useAccountKeyUsage({ days: 7, limit: 5 });
    return <span>{usage?.usage.length ?? 0} recent requests</span>;
}

export function App() {
    return (
        <PolliProvider appKey="pk_your_publishable_key" permissions={["profile"]}>
            <Surface data-theme="amber">
                <WhenLoggedOut>
                    <LoginButton theme="amber">
                        Log in with Pollinations
                    </LoginButton>
                </WhenLoggedOut>
                <WhenLoggedIn>
                    <UserAvatar size="md" />
                    <UserName />
                    <Balance />
                    <KeyPrefix />
                    <KeyBudget />
                    <KeyExpiry />
                    <KeyModels />
                    <RecentRequests />
                    <LogoutButton theme="amber">Log out</LogoutButton>
                </WhenLoggedIn>
            </Surface>
        </PolliProvider>
    );
}
```

For Pollinations apps that use unprefixed Tailwind utilities, import the
package-owned app stylesheet instead:

```css
@import "@pollinations_ai/ui/app.css";
```

`app.css` includes `styles.css`, the Pollinations UI Tailwind theme bridge,
and generic `polli-ui-root`, `polli-ui-body`, and `polli-ui-shell` classes.

Canonical Pollinations source SVGs are exported from the package:

```ts
import logoUrl from "@pollinations_ai/ui/assets/logo.svg";
import logoWordmarkUrl from "@pollinations_ai/ui/assets/logo-wordmark.svg";
```

The SVG sources use `currentColor`. Apps control the rendered color by inlining
them or using them as masks. Root-level favicon, PWA icon, and SEO files stay
app-owned.

Wallet-specific colors and utilities live in a separate stylesheet:

```css
@import "@pollinations_ai/ui/wallet.css";
```

## What's exported

- `@pollinations_ai/ui` exports SDK-free design primitives, helpers, and
  theme data. These can be used without Pollinations auth.
- `@pollinations_ai/ui/auth` exports SDK-free auth modal pieces:
  `AuthModal`, `AuthModalHeader`, `AuthModalLoading`, `AuthInfoCard`, and
  `ErrorBanner`.
- `@pollinations_ai/ui/auth/sdk` exports identity/session components that read
  from the surrounding `<PolliProvider>`:
  - **null when not logged in (or before data loads):** `LogoutButton`,
    `UserAvatar`, `UserEmail`, `UserName`, `WhenLoggedIn`.
  - **shown only when logged out:** `LoginButton`, `WhenLoggedOut`.

  These are intentionally bare wrappers around `useAuth*` hooks. They render
  the data and nothing else — no default copy, no default theme, no default
  intent. The app composes layout, copy, and color.
- `@pollinations_ai/ui/showcase` exports `DesignShowcase`, a package-owned
  internal preview surface for rendering primitives and tokens together.
- `@pollinations_ai/ui/wallet` exports SDK-free wallet-specific display helpers
  and recipes: `formatPollen`, `PaidChip`, `TierChip`, `WalletDot`,
  `WalletBalanceCard`, `PAID_BALANCE_CHART_COLOR`, and
  `TIER_BALANCE_CHART_COLOR`.
- `@pollinations_ai/ui/wallet/sdk` exports SDK-backed wallet components:
  `Balance`, `KeyBudget`, `KeyExpiry`, `KeyModels`, and `KeyPrefix`.
- `@pollinations_ai/ui/modality` exports model-modality color recipes and
  `ModalityButton`.
- `@pollinations_ai/ui/assets/*` exports canonical Pollinations source SVGs:
  `logo.svg` and `logo-wordmark.svg`.
- **Design primitives** — `Button`, `Chip`, `ChevronIcon`, `Collapsible`,
  `CopyButton`, `Dialog`, `Dropdown`, `ExternalLinkButton`, `IconButton`,
  `InfoTip`, `Input`, `MultiSelect`, `PeriodPicker`, `ScrollArea`, `Section`,
  `Slider`, `StatCard`, `Surface`, `Switch`, `TabButton`, `Tooltip`.
- **Helpers** — `cn`, `useScrollLock`, `currentPeriod`,
  `getPeriodBucketKeys`, `periodBucketKeyToDate`.
- **Theme** — `themes` (runtime array of theme names), `ThemeName` (type).

For per-request usage data and other dynamic queries, call the opt-in hooks
from `@pollinations_ai/sdk/react` (`useAccountKeyUsage`, `useAccountKey`,
`useAccountBalance`, etc.) directly.

## Source Layout

- `src/primitives/*` contains generic, SDK-free building blocks.
- `src/modules/*` contains package-owned recipes with domain assumptions
  such as auth, wallet, and modality.
- Public subpath exports (`@pollinations_ai/ui/auth`,
  `@pollinations_ai/ui/auth/sdk`, `@pollinations_ai/ui/wallet`,
  `@pollinations_ai/ui/wallet/sdk`, `@pollinations_ai/ui/modality`,
  `@pollinations_ai/ui/showcase`) are built directly from those modules.

## Theming

Set `data-theme="amber" | "blue" | "pink" | "teal" | "violet" | "green"`
on any ancestor (or per-component via the `theme` prop on Button-family
components) to switch the cascade. Theme variables are defined in
`styles.css` — import it once at your app entry.

## Public design tokens

These CSS variables are part of the public contract. You may reference
them in your own CSS / inline styles. Renames between minor versions
count as breaking.

Public tokens sit under the `--polli-*` namespace so they do not collide
with host app tokens.

**Theme-aware (resolve against the active `data-theme`):**

| Token                         | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `--polli-color-text-base`     | Default body text on themed surfaces.         |
| `--polli-color-text-strong`   | Emphasized text / headings.                   |
| `--polli-color-text-soft`     | Accent text (more saturated than base).       |
| `--polli-color-text-muted`    | De-emphasized text (lighter than base).       |
| `--polli-color-border`        | Default border on themed surfaces.            |
| `--polli-color-bg-subtle`     | Large panel surface (semi-transparent).       |
| `--polli-color-bg-active`     | Selected / active state background.           |
| `--polli-color-bg-hover`      | Hover state background.                       |
| `--polli-color-bg-pale`       | Light wash (cards, chips, large blocks).      |
| `--polli-color-scrollbar-thumb` | Active themed scrollbar thumb color.        |

**Static app tokens:**

| Token                         | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `--polli-font-heading`        | Heading display face.                         |
| `--polli-font-subheading`     | Secondary display face.                       |
| `--polli-font-body`           | Body text face.                               |
| `--polli-font-pixel`          | Pixel/monospace fallback stack.               |
| `--polli-text-micro`          | Micro label size.                             |
| `--polli-text-base`           | Base text size.                               |
| `--polli-color-surface-white` | Translucent white surface.                    |

Wallet tokens are public when `@pollinations_ai/ui/wallet.css` is imported:

| Token                         | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `--polli-color-paid-pale`     | Paid-balance wash.                            |
| `--polli-color-paid-soft`     | Paid-balance marker.                          |
| `--polli-color-paid-deep`     | Paid-balance text.                            |
| `--polli-color-tier-pale`     | Tier-balance wash.                            |
| `--polli-color-tier-soft`     | Tier-balance marker.                          |
| `--polli-color-tier-deep`     | Tier-balance text.                            |

**Intent (theme-independent):**

| Token                             | Purpose                          |
| --------------------------------- | -------------------------------- |
| `--polli-color-danger-bg-light`   | Error surface background.        |
| `--polli-color-danger-text`       | Error text foreground.           |
| `--polli-color-danger-border`     | Error border.                    |

**Example:**

```css
.my-themed-card {
  background: var(--polli-color-bg-pale);
  color: var(--polli-color-text-base);
  border: 1px solid var(--polli-color-border);
}
```

Anything not listed above, including the `polli:*` Tailwind utility class
names, is library-internal and may change without notice.
