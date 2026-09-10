import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountMenu } from "../compositions/AccountMenu.tsx";
import {
    appAccountState,
    PollinationsConnectionPanel,
} from "../modules/app-user-menu/AppUserMenuView.tsx";
import { ErrorBanner } from "../modules/auth/AuthModal.tsx";
import { GitHubSignInButton } from "../modules/auth/GitHubSignInButton.tsx";
import { PollinationsSignInButton } from "../modules/auth/PollinationsSignInButton.tsx";
import { DropdownItem } from "./DropdownItem.tsx";
import { IconButton } from "./IconButton.tsx";
import { TableHeaderCell } from "./Table.tsx";

describe("shared control accessibility", () => {
    it("shows the provider action as visible text and never submits a surrounding form", () => {
        const markup = renderToStaticMarkup(<PollinationsSignInButton />);
        expect(markup).toContain('type="button"');
        expect(markup).toContain("Connect with Pollinations</span>");
        expect(markup).not.toContain("aria-label=");
        expect(markup).toContain('aria-hidden="true"');
        const connect = renderToStaticMarkup(
            <PollinationsSignInButton
                aria-label="Connect with Pollinations"
                disabled
            />,
        );
        expect(connect).toContain('aria-label="Connect with Pollinations"');
        expect(connect).toContain('disabled=""');
    });

    it("uses visible custom button text as its accessible name", () => {
        const markup = renderToStaticMarkup(
            <PollinationsSignInButton>
                Connect my wallet
            </PollinationsSignInButton>,
        );
        expect(markup).toContain("Connect my wallet");
        expect(markup).not.toContain('aria-label="Sign in with Pollinations"');
    });

    it("offers connection feedback without imposing a page or legal footer", () => {
        const connect = <PollinationsSignInButton />;
        const normal = renderToStaticMarkup(
            <PollinationsConnectionPanel>
                {connect}
            </PollinationsConnectionPanel>,
        );
        expect(normal).toContain("Connect with Pollinations");
        expect(normal).not.toContain('role="alert"');
        expect(normal).not.toContain("Terms");
        const pending = renderToStaticMarkup(
            <PollinationsConnectionPanel pending>
                {connect}
            </PollinationsConnectionPanel>,
        );
        expect(pending).toContain('aria-busy="true"');
        expect(pending).toContain('disabled=""');
        const failed = renderToStaticMarkup(
            <PollinationsConnectionPanel error>
                {connect}
            </PollinationsConnectionPanel>,
        );
        expect(failed).toContain('role="alert"');
        expect(failed).toContain("Connect with Pollinations");
        const retry = renderToStaticMarkup(
            <PollinationsConnectionPanel onRetry={() => {}}>
                {connect}
            </PollinationsConnectionPanel>,
        );
        expect(retry).toContain("Couldn’t check your connection.");
        expect(retry).toContain("Try again");
        expect(retry).not.toContain("Connect with Pollinations");
    });

    it("shows account failures instead of a misleading connected menu", () => {
        const ready = { data: {}, error: null, isLoading: false };
        const failed = {
            data: null,
            error: new Error("Unavailable"),
            isLoading: false,
        };
        const empty = { data: null, error: null, isLoading: false };
        expect(appAccountState(ready, ready)).toBeUndefined();
        expect(appAccountState(empty, ready)).toBe("loading");
        for (const [profile, key] of [
            [failed, ready],
            [ready, failed],
            [failed, failed],
        ] as const) {
            const state = appAccountState(profile, key);
            expect(state).toBe("account-error");
            const markup = renderToStaticMarkup(
                <PollinationsConnectionPanel
                    accountState={state}
                    onRetryAccount={() => {}}
                >
                    Connected menu
                </PollinationsConnectionPanel>,
            );
            expect(markup).toContain('role="alert"');
            expect(markup).toContain("Couldn’t load your account details.");
            expect(markup).toContain("Try again");
            expect(markup).not.toContain("Connected menu");
        }
        const loading = appAccountState({ ...ready, isLoading: true }, failed);
        expect(loading).toBe("loading");
        const markup = renderToStaticMarkup(
            <PollinationsConnectionPanel accountState={loading}>
                Connected menu
            </PollinationsConnectionPanel>,
        );
        expect(markup).toContain("Loading account…");
        expect(markup).toContain('disabled=""');
        expect(markup).not.toContain("Connected menu");
    });

    it("identifies GitHub and exposes pending and retry states", () => {
        const ready = renderToStaticMarkup(<GitHubSignInButton />);
        expect(ready).toContain("Sign in with GitHub");
        expect(ready).toContain('type="button"');
        expect(ready).not.toContain('disabled=""');
        const pending = renderToStaticMarkup(
            <GitHubSignInButton isSigningIn />,
        );
        expect(pending).toContain('aria-busy="true"');
        expect(pending).toContain('disabled=""');
        expect(pending).toContain("Signing in");
    });

    it("keeps the sign-in control disabled and busy while checking an account", () => {
        const markup = renderToStaticMarkup(
            <GitHubSignInButton isSigningIn pendingLabel="Checking account…" />,
        );
        expect(markup).toContain("Checking account…");
        expect(markup).toContain('aria-busy="true"');
        expect(markup).toContain('disabled=""');
        expect(markup).not.toContain("Signing in…");
    });

    it("announces authorization failures", () => {
        const markup = renderToStaticMarkup(
            <ErrorBanner>Try again</ErrorBanner>,
        );
        expect(markup).toContain('role="alert"');
    });

    it("renders an account composition without an SDK provider or implicit sign-out action", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu
                name="Alex Morgan"
                secondaryContent="Dashboard session"
            >
                <DropdownItem>Account settings</DropdownItem>
            </AccountMenu>,
        );
        expect(markup).toContain('aria-label="Account menu for Alex Morgan"');
        expect(markup).toContain("AM");
        expect(markup).toContain("Dashboard session");
        expect(markup).not.toContain("Sign Out");
    });

    it("labels the empty-name fallback and accepts an explicit menu label", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu name=" " menuLabel="Connected app">
                <DropdownItem>Disconnect</DropdownItem>
            </AccountMenu>,
        );
        expect(markup).toContain('aria-label="Connected app"');
        expect(markup).toContain("?");
    });
    it("exposes the pressed state of toggle icon buttons", () => {
        const markup = renderToStaticMarkup(
            <IconButton title="Favorite" pressed onClick={() => undefined}>
                ★
            </IconButton>,
        );

        expect(markup).toContain('aria-label="Favorite"');
        expect(markup).toContain('aria-pressed="true"');
    });

    it("exposes the direction of sortable table headers", () => {
        const markup = renderToStaticMarkup(
            <table>
                <thead>
                    <tr>
                        <TableHeaderCell
                            active
                            sortDirection="desc"
                            onSort={() => undefined}
                        >
                            Requests
                        </TableHeaderCell>
                    </tr>
                </thead>
            </table>,
        );

        expect(markup).toContain('aria-sort="descending"');
    });
});
