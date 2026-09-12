import { describe, expect, it } from "vitest";
import { accountActionScreens } from "../frontend/pollen-connect-account-actions";
import {
    dashboardRouteForPreview,
    dashboardScreenForLocation,
    dashboardScreens,
    dashboardSections,
    dashboardSignInResume,
    getDashboardFlow,
} from "../frontend/pollen-connect-dashboard";
import { createDashboardFixture } from "../frontend/pollen-connect-dashboard-preview";
import { createDeploymentsFixture } from "../frontend/pollen-connect-deployments-preview";
import { getFlowFocus } from "../frontend/pollen-connect-diagram";
import { galleryCardsForFlow } from "../frontend/pollen-connect-gallery-data";
import {
    createWalletFixture,
    walletBillingVariants,
} from "../frontend/pollen-connect-wallet-preview";

const url = (path: string) => new URL(path, "https://preview.invalid");

describe("dashboard preview", () => {
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

    it("returns signed-out News to signed-in News after the GitHub handoff", () => {
        expect(
            dashboardSignInResume(
                "https://preview.invalid/pollen-connect-screen.html?screen=dash-news-signed-out&dashboard_preview=1",
            ),
        ).toBe("dash-news");
        expect(dashboardSignInResume("/news")).toBe("dash-news");
        expect(dashboardSignInResume("/keys")).toBe("dash-keys");
        expect(dashboardSignInResume("/sign-in")).toBeUndefined();
        expect(dashboardSignInResume(undefined)).toBeUndefined();
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

    it("persists create, edit and delete into the displayed key list", async () => {
        const fixture = createDashboardFixture(
            new URLSearchParams("keys_empty=1"),
        );
        const request = async (path: string, method = "GET", body = {}) => {
            const response = await fixture(url(path), method, body);
            if (!response) throw new Error("Missing fixture response");
            return response.json();
        };
        const created = await request("/api/api-keys", "POST", {
            name: "Example",
            pollenBudget: 5,
            accountPermissions: ["profile"],
        });
        expect((await request("/api/api-keys")).data).toHaveLength(1);
        expect(created.key).toBe("preview-only-not-a-valid-credential");
        await request(`/api/api-keys/${created.id}/update`, "POST", {
            name: "Renamed",
            pollenBudget: 12,
            accountPermissions: ["usage"],
        });
        expect((await request("/api/api-keys")).data[0]).toMatchObject({
            name: "Renamed",
            pollenBalance: 12,
            permissions: { account: ["usage"] },
        });
        await request("/api/auth/api-key/delete", "POST", {
            keyId: created.id,
        });
        expect((await request("/api/api-keys")).data).toEqual([]);
        const second = await request("/api/api-keys", "POST", {
            name: "Second",
        });
        expect(second.id).not.toBe(created.id);
    });

    it("failed deletion preserves the key and allows a successful retry", async () => {
        const fixture = createDashboardFixture(
            new URLSearchParams("result=error"),
        );
        const remove = () =>
            fixture(url("/api/auth/api-key/delete"), "POST", {
                keyId: "preview-connection",
            });
        expect((await remove())?.status).toBe(503);
        expect(
            (await (await fixture(url("/api/api-keys"), "GET", {}))?.json())
                ?.data,
        ).toHaveLength(3);
        expect((await remove())?.status).toBe(200);
        expect(
            (await (await fixture(url("/api/api-keys"), "GET", {}))?.json())
                ?.data,
        ).toHaveLength(2);
    });

    it("load errors can retry without pretending the account is empty", async () => {
        const fixture = createDashboardFixture(
            new URLSearchParams("account_case=load-error"),
        );
        const read = () => fixture(url("/api/api-keys"), "GET", {});
        expect((await read())?.status).toBe(503);
        expect((await (await read())?.json())?.data).toHaveLength(3);
    });

    it("catalog retry returns usable model records", async () => {
        const fixture = createDashboardFixture(
            new URLSearchParams("model_catalog=error"),
        );
        const read = () => fixture(url("/models"), "GET", {});
        expect((await read())?.status).toBe(503);
        const models = await (await read())?.json();
        expect(models.map((model: { name: string }) => model.name)).toEqual([
            "openai",
            "preview-image",
        ]);
    });
});

describe("wallet preview", () => {
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

    it("keeps failed auto top-up changes unapplied and saves a retry locally", async () => {
        const fixture = createWalletFixture(
            new URLSearchParams("billing_case=ready&result=error"),
        );
        const save = () =>
            fixture(url("/api/stripe/auto-top-up"), "PATCH", {
                enabled: true,
                packAmountUsd: 20,
            });
        const read = async () =>
            (await fixture(url("/api/stripe/billing"), "GET", {}))?.json();
        expect((await save())?.status).toBe(503);
        expect((await read()).autoTopUp).toMatchObject({
            enabled: false,
            packAmountUsd: 10,
        });
        expect((await save())?.status).toBe(200);
        expect((await read()).autoTopUp).toMatchObject({
            enabled: true,
            packAmountUsd: 20,
            thresholdPollen: 5,
        });
        await fixture(url("/api/stripe/auto-top-up"), "PATCH", {
            enabled: false,
            packAmountUsd: 20,
        });
        expect((await read()).autoTopUp.enabled).toBe(false);
    });

    it.each([
        false,
        true,
    ])("returns the billing handoff to the correct wallet (dashboard: %s)", async (dashboard) => {
        const query = new URLSearchParams({
            billing_case: "ready",
            action: "billing-portal",
            result: "success",
            ...(dashboard
                ? { dashboard_preview: "1" }
                : { account_action: "1" }),
        });
        const fixture = createWalletFixture(query);
        await fixture(url("/api/stripe/auto-top-up"), "PATCH", {
            enabled: true,
            packAmountUsd: 20,
        });
        const response = await fixture(
            url("/api/stripe/billing/portal"),
            "POST",
            {},
        );
        if (!response) throw new Error("Missing billing portal response");
        const target = url((await response.json()).url);
        expect(target.origin).toBe("https://preview.invalid");
        expect(target.pathname).toBe("/pollen-connect-screen.html");
        expect(target.searchParams.get("screen")).toBe(
            dashboard ? "dash-billing" : "account-billing",
        );
        expect(target.searchParams.get("billing_case")).toBe("enabled");
        expect(target.searchParams.get("billing_pack")).toBe("20");
        expect(target.searchParams.has("action")).toBe(false);
        expect(target.searchParams.has("result")).toBe(false);
    });
});

describe("model and agent preview data", () => {
    it.each([
        "my-models",
        "agents",
    ])("persists %s creation, editing, visibility and deletion", async (resource) => {
        const fixture = createDeploymentsFixture(
            new URLSearchParams("collection_case=empty"),
        );
        const path = `/api/account/${resource}`;
        const request = async (path: string, method = "GET", body = {}) => {
            const response = await fixture(url(path), method, body);
            if (!response) throw new Error("Missing fixture response");
            expect(response.ok).toBe(true);
            return response.json();
        };
        const created = await request(path, "POST", {
            name: "new",
            title: "New",
            systemPrompt: "Help",
            baseModel: "openai",
        });
        expect((await request(path)).data).toHaveLength(1);
        await request(`${path}/${created.id}`, "PATCH", {
            title: "Renamed",
            hidden: true,
        });
        expect((await request(path)).data[0]).toMatchObject({
            title: "Renamed",
            hidden: true,
        });
        await request(`${path}/${created.id}`, "PATCH", { hidden: false });
        expect((await request(path)).data[0].hidden).toBe(false);
        await request(`${path}/${created.id}`, "DELETE");
        expect((await request(path)).data).toEqual([]);
    });
    it("returns candidate IDs instead of endpoint objects to the real model editor", async () => {
        const fixture = createDeploymentsFixture(new URLSearchParams());
        const response = await fixture(
            url("/api/account/my-models/preview-model/fallback-candidates"),
            "GET",
            {},
        );
        expect(await response?.json()).toEqual({ data: [] });
    });
    it.each([
        "my-models",
        "agents",
    ])("keeps %s after a failed delete and supports retry", async (resource) => {
        const fixture = createDeploymentsFixture(
            new URLSearchParams("result=error"),
        );
        const path = `/api/account/${resource}`;
        const list = async () =>
            (await (await fixture(url(path), "GET", {}))?.json())?.data;
        const before = await list();
        const remove = () =>
            fixture(url(`${path}/${before[0].id}`), "DELETE", {});
        expect((await remove())?.status).toBe(503);
        expect(await list()).toEqual(before);
        expect((await remove())?.status).toBe(200);
        expect(await list()).toHaveLength(before.length - 1);
    });
    it("can recover the list without treating a failure as an empty collection", async () => {
        const fixture = createDeploymentsFixture(
            new URLSearchParams("collection_case=error"),
        );
        const read = () => fixture(url("/api/account/my-models"), "GET", {});
        expect((await read())?.status).toBe(503);
        expect((await (await read())?.json())?.data).toHaveLength(2);
    });
});
