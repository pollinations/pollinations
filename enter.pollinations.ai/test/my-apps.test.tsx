import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
    DASHBOARD_NAV_ITEMS,
    SIGNED_OUT_NAV_ITEMS,
} from "../frontend/src/components/layout/dashboard-theme.ts";
import { MyApps } from "../frontend/src/components/my-apps.tsx";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});
afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const noop = async () => {};
const props = {
    apiKeys: [],
    earnedByKey: new Map<string, number>(),
    githubConnected: true,
    onRetry: noop,
    onUpdateApp: noop,
    onUpdateKey: noop,
    onCreateKey: noop,
    onDeleteKey: noop,
    onDeleteApp: noop,
};

const app = {
    id: "websim",
    name: "Websim",
    emoji: null,
    description: "Generate single-file HTML pages.",
    webUrl: "https://websim.pollinations.app",
    screenshotUrl: "https://media.pollinations.ai/websim",
    category: "build",
    platforms: ["web"],
    repositoryUrl: "https://github.com/pollinations/websim",
    issueUrl: "https://github.com/pollinations/pollinations/issues/1",
    approvedDate: "2026-10-30",
    listed: true,
};

// Earnings off, so the card needs no router for an Activity link.
const appKey = (id: string, redirectUri: string) => ({
    id,
    name: `${id} app`,
    start: "pk_websim",
    createdAt: "2026-10-30T00:00:00.000Z",
    permissions: null,
    metadata: {
        keyType: "publishable",
        redirectUris: [redirectUri],
        plaintextKey: "pk_websim_whole_key",
    },
});

describe("My Apps", () => {
    it("is reached through My listings by every signed-in account", () => {
        // My Apps is the Apps tab of My listings (/my-models?tab=apps).
        expect(
            DASHBOARD_NAV_ITEMS.some((item) => item.to === "/my-models"),
        ).toBe(true);
        expect(
            SIGNED_OUT_NAV_ITEMS.some((item) => item.to === "/my-models"),
        ).toBe(false);
    });

    it("offers submission when no app is listed", () => {
        const html = renderToStaticMarkup(<MyApps {...props} apps={[]} />);
        expect(html).toContain("app-submission.yml");
        expect(html).toContain("for a maintainer to review");
        expect(html).toContain("Approved apps join the");
    });

    it("asks a Google-only account to connect GitHub", () => {
        const connected = renderToStaticMarkup(<MyApps {...props} apps={[]} />);
        const notConnected = renderToStaticMarkup(
            <MyApps {...props} apps={[]} githubConnected={false} />,
        );
        expect(connected).not.toContain('href="/account"');
        expect(notConnected).toContain('href="/account"');
        expect(notConnected).toContain("Connect GitHub");
    });

    it("shows a catalog app with the App Key that covers its address", () => {
        const html = renderToStaticMarkup(
            <MyApps
                {...props}
                apps={[app]}
                apiKeys={[
                    appKey("key-websim", "https://websim.pollinations.app/cb"),
                ]}
            />,
        );
        expect(html).toContain('src="https://media.pollinations.ai/websim"');
        expect(html).toContain("Public");
        expect(html).toContain("Build");
        // Links lose their scheme; a repository shows only its name.
        expect(html).toContain(">websim.pollinations.app<");
        expect(html).toContain(">websim<");
        expect(html).toContain("Oct 30, 2026");
        expect(html).toContain("Active");
        expect(html).toContain("pk_websim_whole_key");
        // One card, so one Pollinations Pay row: the key belongs to the app.
        expect(html.match(/Pollinations Pay/g)).toHaveLength(1);
    });

    it("shows an unlisted app as private and a lone App Key as its own app", () => {
        const html = renderToStaticMarkup(
            <MyApps
                {...props}
                apps={[{ ...app, listed: false }]}
                apiKeys={[appKey("key-other", "http://localhost/callback")]}
            />,
        );
        expect(html).not.toContain("Public");
        expect(html.match(/Private/g)).toHaveLength(2);
        expect(html).toContain("Inactive");
        expect(html).toContain("key-other app");
        expect(html.match(/Pollinations Pay/g)).toHaveLength(2);
    });

    it("distinguishes a failed load from an empty result", () => {
        const html = renderToStaticMarkup(<MyApps {...props} apps={null} />);
        expect(html).toContain("Couldn’t load your apps");
        expect(html).toContain("Try again");
        expect(html).not.toContain("app-submission.yml");
    });
});
