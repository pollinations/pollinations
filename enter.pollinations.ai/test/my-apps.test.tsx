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

describe("My Apps", () => {
    it("shows navigation to every signed-in account", () => {
        expect(DASHBOARD_NAV_ITEMS.some((item) => item.id === "my-apps")).toBe(
            true,
        );
        expect(SIGNED_OUT_NAV_ITEMS.some((item) => item.id === "my-apps")).toBe(
            false,
        );
    });

    it("offers submission when no app is listed", () => {
        const html = renderToStaticMarkup(
            <MyApps apps={[]} githubConnected onRetry={async () => {}} />,
        );
        expect(html).toContain("app-submission.yml");
        expect(html).toContain("show up here once a maintainer approves");
    });

    it("asks a Google-only account to connect GitHub", () => {
        const connected = renderToStaticMarkup(
            <MyApps apps={[]} githubConnected onRetry={async () => {}} />,
        );
        const notConnected = renderToStaticMarkup(
            <MyApps
                apps={[]}
                githubConnected={false}
                onRetry={async () => {}}
            />,
        );
        expect(connected).not.toContain('href="/account"');
        expect(notConnected).toContain('href="/account"');
        expect(notConnected).toContain("Connect GitHub");
    });

    it("shows a listing's screenshot, Pollinations Pay and traffic", () => {
        const app = {
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
            byop: true,
            requests24h: 1234,
        };
        const html = renderToStaticMarkup(
            <MyApps apps={[app]} githubConnected onRetry={async () => {}} />,
        );
        expect(html).toContain('src="https://media.pollinations.ai/websim"');
        expect(html).toContain("Pollinations Pay");
        expect(html).toContain("1,234");
        expect(html).toContain("pollinations/websim");
        expect(html).toContain("Approved Oct 30, 2026");

        const plain = renderToStaticMarkup(
            <MyApps
                apps={[{ ...app, byop: false, requests24h: null }]}
                githubConnected
                onRetry={async () => {}}
            />,
        );
        expect(plain).not.toContain("Pollinations Pay");
        expect(plain).not.toContain("requests");
    });

    it("distinguishes a failed load from an empty result", () => {
        const html = renderToStaticMarkup(
            <MyApps apps={null} githubConnected onRetry={async () => {}} />,
        );
        expect(html).toContain("Couldn’t load your apps");
        expect(html).toContain("Try again");
        expect(html).not.toContain("app-submission.yml");
    });
});
