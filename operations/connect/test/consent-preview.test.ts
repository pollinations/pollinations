import {
    CONSENT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    parseScopeList,
} from "@shared/auth/authorize-config.ts";
import { describe, expect, it } from "vitest";
import { appLoginScreens } from "../pollen-connect-app-login";
import { canvasGroups, canvasScreenUrl } from "../pollen-connect-canvas-data";
import { dashboardSections } from "../pollen-connect-dashboard";
import { getDeviceFlow } from "../pollen-connect-device";
import { edgePoints, getFlowFocus, nodeSize } from "../pollen-connect-diagram";

const flows = [
    { id: "app", section: "main" },
    { id: "app", section: "topup" },
    { id: "device", section: "main" },
    { id: "device", section: "link" },
    { id: "admin", section: "main" },
    ...dashboardSections.map(({ id }) => ({
        id: "account" as const,
        section: id,
    })),
] as const;

describe("focused flow navigation", () => {
    it("includes shared sign-in in app, device, account and admin journeys", () => {
        for (const id of ["app", "device", "account", "admin"] as const) {
            const focus = getFlowFocus(id);
            if (id === "admin") {
                const focus = getFlowFocus("admin");
                for (const screen of [
                    "dashboard-sign-in",
                    "identity",
                    "admin-github",
                    "admin-auth-error",
                    "dashboard-connected",
                ])
                    expect(focus.nodeIds.has(screen)).toBe(true);
                expect(focus.edges).toContainEqual(
                    expect.objectContaining({
                        from: "admin-auth-error",
                        to: "identity",
                    }),
                );
                continue;
            }
            if (id === "account") {
                for (const shared of [
                    "enter-signed-out",
                    "dashboard-github",
                    "dashboard-auth-error",
                ])
                    expect(focus.nodeIds.has(shared)).toBe(true);
                expect(focus.edges).toContainEqual(
                    expect.objectContaining({
                        from: "dashboard-auth-error",
                        to: "enter-signed-out",
                    }),
                );
                continue;
            }
            for (const shared of [
                "sign-in",
                ...(["app", "device"].includes(id)
                    ? ["github-handoff"]
                    : ["github-login", "github-authorize"]),
                "error",
            ])
                expect(focus.nodeIds.has(shared)).toBe(true);
            expect(
                focus.edges.some(
                    (edge) =>
                        edge.from === "error" &&
                        edge.to ===
                            (id === "app"
                                ? "app-signing-in"
                                : id === "device"
                                  ? "device-signing-in"
                                  : "github-session"),
                ),
            ).toBe(true);
        }
    });
    it("offers a dashboard route from the connected app", () => {
        expect(
            getFlowFocus("app").edges.some(
                (edge) =>
                    edge.from === "app-connected" && edge.to === "app-home",
            ),
        ).toBe(true);
    });
    it("keeps cross-flow branches out of the focused path", () => {
        const app = getFlowFocus("app");
        expect(
            app.edges.some(
                (edge) => edge.to === "device-done" || edge.to === "admin",
            ),
        ).toBe(false);
        const device = getFlowFocus("device");
        expect(
            device.edges.some(
                (edge) => edge.from === "sign-in" && edge.to === "cancelled",
            ),
        ).toBe(false);
        expect(
            device.edges.some(
                (edge) =>
                    edge.from === "device-denying" &&
                    edge.to === "device-declined",
            ),
        ).toBe(true);
    });
    it("fits every participating card and every visible arrow, including outlying returns", () => {
        for (const { id, section } of flows) {
            const { nodes, edges, nodeIds, bounds } = getFlowFocus(id, section);
            expect(nodes.length).toBe(nodeIds.size);
            expect(nodes.length).toBeGreaterThan(0);
            const contains = (x: number, y: number) =>
                x >= bounds.x &&
                x <= bounds.x + bounds.width &&
                y >= bounds.y &&
                y <= bounds.y + bounds.height;
            for (const node of nodes) {
                const size = nodeSize(node);
                expect(contains(node.x, node.y)).toBe(true);
                expect(
                    contains(node.x + size.width, node.y + size.height),
                ).toBe(true);
            }
            for (const edge of edges) {
                expect(nodeIds.has(edge.from) && nodeIds.has(edge.to)).toBe(
                    true,
                );
                expect(
                    edgePoints(edge, nodes).every(([x, y]) => contains(x, y)),
                ).toBe(true);
            }
        }
    });
});
describe("authorization preview coverage", () => {
    it("connects each selectable graph with valid references and keeps consent recovery", () => {
        for (const { id, section } of flows) {
            const { nodes, edges } = getFlowFocus(id, section);
            const ids = new Set(nodes.map((node) => node.id));
            expect(ids.size, `${id}/${section}`).toBe(nodes.length);
            for (const edge of edges) {
                expect(
                    ids.has(edge.from),
                    `${id}/${section}: ${edge.from}`,
                ).toBe(true);
                expect(ids.has(edge.to), `${id}/${section}: ${edge.to}`).toBe(
                    true,
                );
                expect(
                    edgePoints(edge, nodes).flat().every(Number.isFinite),
                ).toBe(true);
            }
        }
        expect(
            getDeviceFlow().edges.some(
                (edge) =>
                    edge.from === "device-result" &&
                    edge.to === "device-done" &&
                    edge.label === "Device retrieves key",
            ),
        ).toBe(true);
        const app = getFlowFocus("app");
        expect(app.edges).toContainEqual(
            expect.objectContaining({ from: "consent", to: "cancelled" }),
        );
        expect(app.edges).toContainEqual(
            expect.objectContaining({ from: "error", to: "app-signing-in" }),
        );
        const represented = new Set(
            [...appLoginScreens.values()].map((entry) =>
                entry.id.split("--")[0].replace(/-errors$/, ""),
            ),
        );
        for (const entry of canvasGroups[0].screens)
            expect(represented.has(entry.id), entry.id).toBe(true);
    });
    it("shows each screen once with distinct route parameters", () => {
        const screens = canvasGroups.flatMap((group) => group.screens);
        expect(new Set(screens.map((screen) => screen.id)).size).toBe(
            screens.length,
        );
        const productScreens = screens.filter((screen) => screen.screen);
        expect(
            new Set(productScreens.map((screen) => canvasScreenUrl(screen)))
                .size,
        ).toBe(productScreens.length);
        const consent = screens.find((screen) => screen.id === "consent");
        expect(consent).toBeDefined();
        if (!consent) throw new Error("Missing consent screen");
    });
    for (let mask = 0; mask < 1 << CONSENT_PERMISSIONS.length; mask++) {
        const scopes = CONSENT_PERMISSIONS.filter(
            (_, index) => mask & (1 << index),
        );
        it(`preserves the production scope combination: ${scopes.join(", ") || "none"}`, () => {
            const params = new URLSearchParams({ scope: scopes.join(" ") });
            expect(
                getAuthorizeInitialPermissions({
                    permissions: parseScopeList(params.get("scope")),
                }).accountPermissions,
            ).toEqual(scopes.length ? scopes : null);
        });
    }
});
describe("account inventory", () => {
    it("includes account checkout in the dashboard flow", () => {
        expect(getFlowFocus("account").nodeIds.has("account-checkout")).toBe(
            true,
        );
    });
});
describe("provider inventory", () => {
    it("keeps provider-internal pages out of the Apps flow", () => {
        for (const removed of [
            "github-login",
            "github-signup",
            "github-authorize",
            "github-session",
            "github-approval",
            "google-account",
            "github-profile",
            "email-verify",
        ])
            expect(getFlowFocus("app").nodeIds.has(removed)).toBe(false);
    });
});
