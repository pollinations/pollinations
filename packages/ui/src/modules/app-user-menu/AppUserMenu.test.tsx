import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AppUserMenu } from "./AppUserMenu.tsx";

const sdk = vi.hoisted(() => ({
    auth: { isLoggedIn: true },
    profile: { data: { name: "Pollinations Agent", image: null } },
    key: {
        data: {
            id: "key-1" as string | undefined,
            pollenBudget: 5 as number | null,
            permissions: { account: [] as string[], models: ["openai"] },
        },
        refresh: vi.fn(),
    },
    balance: {
        data: undefined as
            | { accountBalance: { paid: number; tier: number } }
            | undefined,
        refresh: vi.fn(),
    },
    actions: {
        logout: vi.fn(),
        enterUrl: "https://enter.pollinations.ai",
    },
}));

vi.mock("@pollinations/sdk/react", () => ({
    useAuthState: () => sdk.auth,
    useAccountProfile: () => sdk.profile,
    useAccountKey: () => sdk.key,
    useAccountBalance: () => sdk.balance,
    useAuthActions: () => sdk.actions,
}));

vi.mock("../../compositions/AccountMenu.tsx", () => ({
    AccountMenu: ({
        name,
        secondaryContent,
        children,
    }: {
        name: string;
        secondaryContent?: ReactNode;
        children: ReactNode | ((close: () => void) => ReactNode);
    }) => (
        <div>
            <span>{name}</span>
            {secondaryContent}
            {typeof children === "function" ? children(() => {}) : children}
        </div>
    ),
}));

vi.mock("../auth/sdk.ts", () => ({
    LoginButton: ({ children }: { children: ReactNode }) => (
        <button type="button">{children}</button>
    ),
}));

function renderMenu() {
    return renderToStaticMarkup(<AppUserMenu />);
}

describe("AppUserMenu", () => {
    beforeEach(() => {
        sdk.auth.isLoggedIn = true;
        sdk.key.data = {
            id: "key-1",
            pollenBudget: 5,
            permissions: { account: [], models: ["openai"] },
        };
        sdk.balance.data = undefined;
    });

    afterEach(() => vi.unstubAllGlobals());

    test("renders the branded connect pill when logged out", () => {
        sdk.auth.isLoggedIn = false;

        const html = renderMenu();

        expect(html).toContain("Pollinations Connect");
        expect(html).toContain("mask:url(");
    });

    test("shows Permissions only when the connected key has an id", () => {
        expect(renderMenu()).toContain("Permissions");

        sdk.key.data = { ...sdk.key.data, id: undefined };

        expect(renderMenu()).not.toContain("Permissions");
    });

    test("shows the connected key budget", () => {
        const html = renderMenu();

        expect(html).toContain("App budget:");
        expect(html).toContain("5");
        expect(html).not.toContain("Unlimited");
    });

    test("shows the wallet for an unlimited key with usage permission", () => {
        sdk.key.data = {
            ...sdk.key.data,
            pollenBudget: null,
            permissions: { account: ["usage"], models: ["openai"] },
        };
        sdk.balance.data = { accountBalance: { paid: 3, tier: 7 } };

        const html = renderMenu();

        expect(html).toContain("Quest Pollen:");
        expect(html).toContain("Paid Pollen:");
        expect(html).not.toContain("Unlimited");
    });

    test("shows Unlimited only when the key cannot read the wallet", () => {
        sdk.key.data = {
            ...sdk.key.data,
            pollenBudget: null,
            permissions: { account: [], models: ["openai"] },
        };
        expect(renderMenu()).toContain("Unlimited");

        sdk.key.data.permissions.account = ["usage"];

        expect(renderMenu()).not.toContain("Unlimited");
    });

    test("keeps the app query and hash in outbound return links", () => {
        vi.stubGlobal("window", {
            location: { href: "https://app.example/?room=abc#thread" },
        });

        const html = renderMenu();

        expect(html).toContain(
            "redirect=https%3A%2F%2Fapp.example%2F%3Froom%3Dabc%23thread",
        );
    });
});
