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

- **Auth-aware primitives** — `Balance`, `KeyPrefix`, `LoginButton`,
  `LogoutButton`, `PermissionList`, `RequestPermissions`, `TopUpLink`,
  `UserAvatar`, `UserEmail`, `UserName`, `WhenLoggedIn`, `WhenLoggedOut`.
  Each reads from the surrounding `<PolliProvider>` and renders `null` when
  the required state is unavailable.
- **Design primitives** — `Button`, `Chip`, `Disclosure`, `IconButton`,
  `InfoTip`, `Input`, `LinkButton`, `Surface`, `Switch`, `TabButton`,
  `Tooltip`, `ChevronIcon`.
- **Helpers** — `cn`, `formatPollen`, `ThemeName`.

## Theming

Set `data-theme="amber" | "blue" | "pink" | "teal" | "violet" | "green"`
on any ancestor (or per-component via the `theme` prop on Button-family
components) to switch the cascade. Theme variables are defined in
`styles.css` — import it once at your app entry.
