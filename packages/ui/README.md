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
import { PolliProvider } from "@pollinations_ai/sdk/react";
import {
    Balance,
    LoginButton,
    LogoutButton,
    TopUpLink,
    UserAvatar,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations_ai/ui";

export function App() {
    return (
        <PolliProvider appKey="pk_your_publishable_key">
            <div data-theme="amber">
                <WhenLoggedOut>
                    <LoginButton theme="amber">
                        Log in with Pollinations
                    </LoginButton>
                </WhenLoggedOut>
                <WhenLoggedIn>
                    <UserAvatar size="md" />
                    <UserName />
                    <Balance />
                    <TopUpLink theme="amber">Top up</TopUpLink>
                    <LogoutButton theme="amber">Log out</LogoutButton>
                </WhenLoggedIn>
            </div>
        </PolliProvider>
    );
}
```

## What's exported

- **Auth-aware primitives** — all read from the surrounding `<PolliProvider>`:
  - **null when not in the required state:** `Balance`, `KeyPrefix`,
    `LogoutButton`, `UserAvatar`, `UserEmail`, `UserName`, `WhenLoggedIn` —
    these render only when a user is signed in (and, for the profile-bound
    ones, after profile data has loaded).
  - **shown only when logged out:** `LoginButton`, `WhenLoggedOut`.
  - **always render (read context but don't gate on auth):** `TopUpLink`,
    `PermissionList`, `RequestPermissions`.
- **Design primitives** — `Button`, `Chip`, `Disclosure`, `IconButton`,
  `InfoTip`, `Input`, `LinkButton`, `Surface`, `Switch`, `TabButton`,
  `Tooltip`, `ChevronIcon`.
- **Helpers** — `cn`, `formatPollen`.
- **Theme** — `themes` (runtime array of theme names), `ThemeName` (type).

## Theming

Set `data-theme="amber" | "blue" | "pink" | "teal" | "violet" | "green"`
on any ancestor (or per-component via the `theme` prop on Button-family
components) to switch the cascade. Theme variables are defined in
`styles.css` — import it once at your app entry.

## Public design tokens

These CSS variables are part of the public contract. You may reference
them in your own CSS / inline styles. Renames between minor versions
count as breaking.

All public tokens sit under the `--polli-color-*` namespace so they can't
collide with Tailwind v4's prefixed namespaces (`--polli-text-*`,
`--polli-font-*`, `--polli-spacing-*`, etc. — all reserved by the
internal Tailwind theme).

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

Anything not listed above (including the `polli:*` Tailwind utility
class names and the `--color-paid-*` / `--color-tier-*` hue ramps) is
library-internal and may change without notice.
