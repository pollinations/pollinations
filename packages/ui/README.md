# @pollinations_ai/ui

Internal UI primitives for Pollinations apps. Auth state lives in
[`@pollinations_ai/sdk/react`](../sdk/README.md#react-auth-provider) — this
package provides the visual layer that consumes it.

## Install

```bash
npm install @pollinations_ai/sdk @pollinations_ai/ui
```

## Usage

```tsx
import "@pollinations_ai/ui/styles.css";
import { PolliProvider, useAccountKeyUsage } from "@pollinations_ai/sdk/react";
import { Surface } from "@pollinations_ai/ui";
import {
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations_ai/ui/auth";

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

## What's exported

- `@pollinations_ai/ui` exports SDK-free design primitives, helpers, and
  theme data. These can be used without Pollinations auth.
- `@pollinations_ai/ui/auth` exports auth-aware components that read from the
  surrounding `<PolliProvider>`:
  - **null when not logged in (or before data loads):** `Balance`,
    `KeyBudget`, `KeyExpiry`, `KeyModels`, `KeyPrefix`, `LogoutButton`,
    `UserAvatar`, `UserEmail`, `UserName`, `WhenLoggedIn`.
  - **shown only when logged out:** `LoginButton`, `WhenLoggedOut`.

  These are intentionally bare wrappers around `useAuth*` hooks. They render
  the data and nothing else — no default copy, no default theme, no default
  intent. The app composes layout, copy, and color.
- **Design primitives** — `Button`, `Chip`, `Disclosure`, `IconButton`,
  `InfoTip`, `Input`, `LinkButton`, `MultiSelect`, `PeriodPicker`,
  `RangeSlider`, `ScrollArea`, `Section`, `Surface`, `Switch`, `TabButton`,
  `Tooltip`, `ChevronIcon`.
- **Helpers** — `cn`, `formatPollen`, `currentPeriod`,
  `formatPeriodLabel`, `getPeriodBucketKeys`, `isPeriodSelectable`,
  `periodBucketKeyToDate`, `periodFromDate`, `periodToWindow`,
  `startOfUtcDay`.
- **Theme** — `themes` (runtime array of theme names), `ThemeName` (type).

For per-request usage data and other dynamic queries, call the opt-in hooks
from `@pollinations_ai/sdk/react` (`useAccountKeyUsage`, `useAccountKey`,
`useAccountBalance`, etc.) directly.

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
| `--polli-color-paid-pale`     | Paid-balance wash.                            |
| `--polli-color-paid-soft`     | Paid-balance marker.                          |
| `--polli-color-paid-deep`     | Paid-balance text.                            |
| `--polli-color-tier-pale`     | Tier-balance wash.                            |
| `--polli-color-tier-soft`     | Tier-balance marker.                          |
| `--polli-color-tier-deep`     | Tier-balance text.                            |
| `--polli-color-surface-white` | Translucent white surface.                    |

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
