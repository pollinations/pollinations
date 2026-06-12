# @pollinations/ui

Internal UI primitives, compositions, and modules for Pollinations apps.
SDK-backed subpaths consume auth state from
[`@pollinations/sdk/react`](../sdk/README.md#react-auth-provider); core
primitives and display recipes stay SDK-free.

## Install

> [!WARNING]
> **The `alpha` line (`0.1.0-alpha.x`) is unstable and breakage-prone.** It ships the in-progress design-system rebuild (new `--polli-color-*` token system, new primitives, renamed size props `sm|md|lg`) and its API may change between alpha versions without notice. The stable `latest` line is `0.0.2`. Opt into the alpha deliberately, and pin an exact version.

```bash
# stable (recommended)
npm install @pollinations/ui

# alpha (in-progress rebuild — pin exactly)
npm install @pollinations/ui@alpha
```

Install `@pollinations/sdk` too when using the
`@pollinations/ui/app-user-menu/sdk` subpath.

## Usage

```tsx
import "@pollinations/ui/styles.css";
import { PolliProvider } from "@pollinations/sdk/react";
import { Surface } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";

export function App() {
    return (
        <PolliProvider appKey="pk_your_publishable_key" permissions={["profile"]}>
            <Surface data-theme="amber">
                <AppUserMenu dashboardHref="https://enter.pollinations.ai" />
            </Surface>
        </PolliProvider>
    );
}
```

For Pollinations apps that use unprefixed Tailwind utilities, import the
package-owned app stylesheet instead:

```css
@import "@pollinations/ui/app.css";
```

`app.css` includes `styles.css`, the Pollinations UI Tailwind theme bridge,
and generic `polli-ui-root`, `polli-ui-body`, and `polli-ui-shell` classes.

Canonical Pollinations source SVGs are exported from the package:

```ts
import logoUrl from "@pollinations/ui/assets/logo.svg";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
```

The SVG sources use `currentColor`. Apps control the rendered color by inlining
them or using them as masks. Root-level favicon, PWA icon, and SEO files stay
app-owned.

Wallet colors and utilities are bundled into the main stylesheet
(`@pollinations/ui/styles.css`) — no separate import needed.

## What's exported

- `@pollinations/ui` exports SDK-free design primitives, helpers, and
  theme data. These can be used without Pollinations auth.
- `@pollinations/ui/auth` exports SDK-free auth modal pieces:
  `AuthModal`, `AuthModalHeader`, `AuthModalLoading`, `AuthInfoCard`, and
  `ErrorBanner`.
- `@pollinations/ui/wallet` exports SDK-free wallet-specific display helpers
  and recipes: `formatPollen`, `PaidChip`, `TierChip`, `WalletDot`,
  `WalletBalanceCard`, `PAID_BALANCE_CHART_COLOR`, and
  `TIER_BALANCE_CHART_COLOR`.
- `@pollinations/ui/app-user-menu/sdk` exports the SDK-backed app account
  menu module.
- `@pollinations/ui/gen` exports the generation UI — `ModelSelector`,
  category labels, and the model-modality theme mapping.
- `@pollinations/ui/assets/*` exports canonical Pollinations source SVGs:
  `logo.svg` and `logo-wordmark.svg`.
- **Design primitives** — `Button`, `ButtonGroup`, `Chip`, `ChevronIcon`,
  `Dialog`, `DialogTitle`, `Dropdown`, `DropdownItem`, `Field`, `Heading`,
  `IconButton`, `InlineLink`, `Input`, `ScrollArea`, `Slider`, `Surface`,
  `Switch`, `TabButton`, `Table`, `TableBody`, `TableCell`, `TableHead`,
  `TableHeaderCell`, `TableRow`, `Text`, `Textarea`, `Tooltip`.
- **Design compositions** — `Alert`, `CodeBlock`, `Collapsible`,
  `CopyButton`, `ExternalLinkButton`, `FileUpload`, `InfoTip`, `LinkCard`,
  `Markdown`, `MediaPlaceholder`, `MultiSelect`, `NavItem`, `PeriodPicker`,
  `Prose`, `Section`, `StatCard`.
- **Helpers** — `cn`, `useScrollLock`, `currentPeriod`,
  `getPeriodBucketKeys`, `periodBucketKeyToDate`.
- **Theme** — `themes` (runtime array of theme names), `ThemeName` (type).

For per-request usage data and other dynamic queries, call the opt-in hooks
from `@pollinations/sdk/react` (`useAccountKeyUsage`, `useAccountKey`,
`useAccountBalance`, etc.) directly.

## Source Layout

- `src/primitives/*` contains generic, SDK-free building blocks.
- `src/compositions/*` contains SDK-free recipes that compose primitives.
- `src/modules/*` contains package-owned recipes with domain assumptions
  such as auth, wallet, app-user-menu, and gen.
- Public subpath exports (`@pollinations/ui/auth`,
  `@pollinations/ui/wallet`, `@pollinations/ui/gen`,
  `@pollinations/ui/app-user-menu/sdk`) are built directly from those source
  layers.

## Theming

Set `data-theme="amber" | "blue" | "pink" | "coral" | "teal" | "violet" | "emerald"`
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

Wallet tokens are public (bundled into `@pollinations/ui/styles.css`):

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
| `--polli-color-success-bg-light`  | Success surface background.      |
| `--polli-color-success-text`      | Success text foreground.         |
| `--polli-color-success-border`    | Success border.                  |
| `--polli-color-warning-bg-light`  | Warning surface background.      |
| `--polli-color-warning-text`      | Warning text foreground.         |
| `--polli-color-warning-border`    | Warning border.                  |

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
