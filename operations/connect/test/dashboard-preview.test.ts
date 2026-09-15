import { describe, expect, it } from "vitest";
import { accountActionScreens } from "../pollen-connect-account-actions";
import {
    dashboardRouteForPreview,
    dashboardScreenForLocation,
    dashboardScreens,
    dashboardSections,
    getDashboardFlow,
} from "../pollen-connect-dashboard";
import { getFlowFocus } from "../pollen-connect-diagram";
import { galleryCardsForFlow } from "../pollen-connect-gallery-data";
import { walletBillingVariants } from "../pollen-connect-wallet-preview";
import {
    appTopupReviewCases,
    dashboardReviewCasesForSection,
} from "../review-dashboard";

describe("dashboard preview", () => {
    it("does not identify unknown routes as Wallet", () => {
        expect(dashboardScreenForLocation("/pollen")).toBe("enter-connected");
        expect(dashboardScreenForLocation("/not-a-dashboard-page")).toBe(
            "unknown",
        );
    });
    it("requires operation-specific error text, so a bootstrap alert cannot pass a failed situation", () => {
        const cases = [
            ...appTopupReviewCases,
            ...dashboardSections.flatMap(({ id }) =>
                dashboardReviewCasesForSection(id),
            ),
        ];
        // Positive alert checks require copy. A body assertion that
        // excludes alerts proves a healthy/pending page instead.
        for (const recipe of cases)
            for (const assertion of recipe.expected)
                if (/^\[role=['"]alert['"]\]/.test(assertion.selector))
                    expect(assertion.text?.trim(), recipe.id).toBeTruthy();
        for (const recipe of cases.filter(
            ({ pageId, title }) =>
                /^(key|app|model|agent)-(create|edit|delete|visibility)$/.test(
                    pageId,
                ) && /failed/i.test(title),
        ))
            expect(
                recipe.expected.some(
                    ({ selector, text }) =>
                        selector === "[role='dialog']" && Boolean(text),
                ),
                recipe.id,
            ).toBe(true);
    });
    it("distinguishes signed-in and signed-out announcements through the real account controls", () => {
        const news = dashboardReviewCasesForSection("news");
        expect(news).toHaveLength(2);
        expect(news[0].conditions.account).toBe("signed-in");
        expect(news[1].conditions.account).toBe("signed-out");
        expect(news[0].expected).not.toEqual(news[1].expected);
        for (const recipe of news)
            expect(
                recipe.expected.some(
                    ({ selector }) =>
                        selector.includes("Account menu for ") &&
                        selector.includes("Sign in with GitHub"),
                ),
            ).toBe(true);
    });
    it("proves a credited wallet includes the added Pollen and claimed rewards are no longer claimable", () => {
        const credited = [
            ...appTopupReviewCases,
            ...dashboardReviewCasesForSection("topup"),
        ].filter(({ prepare }) => prepare?.payment === "credited");
        expect(credited).toHaveLength(2);
        for (const recipe of credited)
            expect(
                recipe.expected.some(
                    ({ selector }) =>
                        selector.includes("polli-wallet-panel-paid") &&
                        selector.includes('"15"'),
                ),
                recipe.id,
            ).toBe(true);
        const claimed = dashboardReviewCasesForSection("quests").find(
            ({ prepare }) => prepare?.rewards === "claimed",
        );
        expect(claimed?.expected).toContainEqual({
            selector: 'body:not(:has(button:text-is("Claim")))',
        });
        const checkFailed = dashboardReviewCasesForSection("quests").find(
            ({ title }) => title.endsWith("Check unavailable"),
        );
        expect(checkFailed?.requests).toContainEqual({
            path: "/api/quests/check",
            method: "POST",
            outcome: "server-error",
        });
        expect(checkFailed?.expected).toContainEqual({
            selector: 'button:text-is("Claim")',
        });
    });
    it.each(
        dashboardSections.map((s) => s.id),
    )("shares the %s inventory across views", (section) => {
        const flow = getDashboardFlow(section);
        expect(galleryCardsForFlow("account", section)).toEqual(flow.screens);
        expect(getFlowFocus("account", section).nodes).toEqual(flow.nodes);
        const ids = flow.nodes.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const edge of flow.edges) {
            expect(ids).toContain(edge.from);
            expect(ids).toContain(edge.to);
        }
    });
    it("separates login, wallet and key dialogs without duplicating screens", () => {
        const ids = (section: string) =>
            getDashboardFlow(section).screens.map((e) => e.id);
        expect(ids("main")).toEqual([
            "enter-signed-out",
            "dashboard-github",
            "dashboard-auth-error",
        ]);
        expect(ids("topup")).toEqual([
            "enter-connected",
            "account-checkout",
            "account-billing",
        ]);
        for (const page of ["news", "catalog", "activity", "quests"])
            expect(ids(page)).toEqual([page]);
        expect(ids("account")).toEqual(["account", "account-delete"]);
        expect(ids("keys")).toEqual([
            "keys",
            "key-create",
            "key-edit",
            "key-delete",
        ]);
        expect(ids("apps")).toEqual([
            "apps",
            "app-create",
            "app-edit",
            "app-delete",
        ]);
        expect(ids("models")).toEqual([
            "models",
            "model-create",
            "model-edit",
            "model-delete",
            "model-visibility",
        ]);
        expect(ids("agents")).toEqual([
            "agents",
            "agent-create",
            "agent-edit",
            "agent-delete",
            "agent-visibility",
        ]);
        const keys = getDashboardFlow("keys").screens[0];
        expect(keys.variants?.map((v) => v.label)).toEqual([
            "Populated",
            "Empty",
        ]);
        const all = dashboardSections.flatMap((section) => ids(section.id));
        expect(new Set(all).size).toBe(all.length);
        expect(all).toEqual(dashboardScreens.map((s) => s.id));
    });
    it.each([
        ["news", "/news"],
        ["catalog", "/models"],
        ["activity", "/activity"],
        ["quests", "/quests"],
        ["account", "/account"],
    ])("keeps the %s navigation destination in its own inventory", (id, path) => {
        expect(dashboardRouteForPreview(`dash-${id}`)).toBe(path);
        expect(dashboardScreenForLocation(path)).toBe(id);
        expect(getDashboardFlow(id).screens[0].screen).toBe(`dash-${id}`);
    });
    it("distinguishes public models and signed-in news from model management and sign-in", () => {
        expect(dashboardScreenForLocation("/models")).toBe("catalog");
        expect(dashboardScreenForLocation("/my-models")).toBe("models");
        expect(dashboardScreenForLocation("/news")).toBe("news");
        expect(dashboardScreenForLocation("/sign-in")).toBe("enter-signed-out");
        expect(dashboardRouteForPreview("dash-news-signed-out")).toBe("/news");
        expect(dashboardRouteForPreview("dash-account-delete")).toBe(
            "/account",
        );
        expect(
            dashboardScreenForLocation(
                "/account",
                "Delete Pollinations account?",
            ),
        ).toBe("account-delete");
    });
    it.each([
        ["keys", "key", "/keys"],
        ["apps", "app", "/apps"],
        ["models", "model", "/my-models"],
        ["agents", "agent", "/agents"],
    ])("maps actual %s routes and dialogs back to their inventory", (section, prefix, path) => {
        expect(dashboardScreenForLocation(path)).toBe(section);
        for (const [operation, heading] of [
            ["create", "Add"],
            ["edit", "Edit"],
            ["delete", "Delete"],
        ]) {
            expect(
                dashboardScreenForLocation(path, `${heading} ${prefix}`),
            ).toBe(`${prefix}-${operation}`);
            expect(
                dashboardRouteForPreview(`dash-${section}-${operation}`),
            ).toBe(path);
        }
        for (const screen of getDashboardFlow(section).screens)
            for (const variant of screen.variants ?? [{}])
                expect(
                    dashboardRouteForPreview(variant.screen ?? screen.screen),
                ).toBe(path);
    });
});
describe("wallet preview", () => {
    it("exposes shared session recovery for wallet reads and billing writes", () => {
        for (const cases of [
            appTopupReviewCases,
            dashboardReviewCasesForSection("topup"),
        ]) {
            for (const variant of [
                "Session expired",
                "Billing session expired",
            ]) {
                const item = cases.find((item) => item.variant === variant);
                expect(
                    item?.requests?.some(
                        (request) => request.outcome === "unauthorized",
                    ),
                    variant,
                ).toBe(true);
                expect(item?.expected).toContainEqual({
                    selector: "button:not(:disabled)",
                    text: "Sign in again",
                });
            }
        }
    });
    it("shares billing states between app top-up and dashboard wallet", () => {
        for (const entry of [
            accountActionScreens.find(
                (screen) => screen.id === "account-wallet",
            ),
            dashboardScreens.find((screen) => screen.id === "enter-connected"),
        ])
            expect(
                entry?.variants?.filter(
                    (variant) => variant.params?.billing_case,
                ),
            ).toEqual(walletBillingVariants);
        expect(getDashboardFlow("topup").edges).toContainEqual({
            from: "enter-connected",
            to: "account-billing",
            label: "Manage billing",
        });
    });
});
