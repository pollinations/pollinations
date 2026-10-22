import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
    dashboardNavItems,
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
    it("keeps navigation hidden until an account has listed apps", () => {
        expect(dashboardNavItems().some((item) => item.id === "my-apps")).toBe(
            false,
        );
        expect(
            dashboardNavItems(false).some((item) => item.id === "my-apps"),
        ).toBe(false);
        expect(
            dashboardNavItems(true).some((item) => item.id === "my-apps"),
        ).toBe(true);
        expect(SIGNED_OUT_NAV_ITEMS.some((item) => item.id === "my-apps")).toBe(
            false,
        );
    });

    it("retains the empty-state component for a later launch", () => {
        const html = renderToStaticMarkup(
            <MyApps apps={[]} onRetry={async () => {}} />,
        );
        expect(html).toContain("You haven’t listed an app yet");
        expect(html).toContain("Submit your app");
    });

    it("distinguishes a failed load from an empty result", () => {
        const html = renderToStaticMarkup(
            <MyApps apps={null} onRetry={async () => {}} />,
        );
        expect(html).toContain("Couldn’t load your apps");
        expect(html).toContain("Try again");
        expect(html).not.toContain("You haven’t listed an app yet");
    });
});
