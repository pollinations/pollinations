import {
    CONSENT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    parseScopeList,
} from "@shared/auth/authorize-config.ts";
import { describe, expect, it } from "vitest";
import {
    addPollenAmounts,
    addPollenPlan,
    defaultAddPollenAmount,
} from "../frontend/pollen-connect-add-pollen-data";
import {
    appLoginAutomaticDestination,
    appLoginScreens,
} from "../frontend/pollen-connect-app-login";
import {
    canvasGroups,
    canvasScreenUrl,
} from "../frontend/pollen-connect-canvas-data";
import {
    edgePoints,
    flowEdges,
    flowNodes,
    flowSections,
    getFlowFocus,
    nodeSize,
} from "../frontend/pollen-connect-diagram";
import {
    defaultJourneySettings,
    type JourneyState,
    journeyAdvance,
    journeyFunding,
    journeyOptions,
    journeyStep,
    restoreJourney,
    simulateUsage,
    startJourney,
    withJourneyCondition,
} from "../frontend/pollen-connect-journey-state";
import {
    previewAuthorizeParams,
    previewScopeOptions,
    readPreviewRequest,
} from "../frontend/pollen-connect-request-config";

describe("Add Pollen flow preview", () => {
    it("offers the app-limit increments and starts at 5", () => {
        expect(addPollenAmounts).toEqual([1, 2, 3, 4, 5, 10, 20]);
        expect(defaultAddPollenAmount).toBe(5);
    });
    it("keeps only unresolved payment screens inside the app", () => {
        const screens = canvasGroups.flatMap((group) => group.screens);
        const receipt = screens.find(
            (screen) => screen.id === "add-pollen-pending",
        );
        expect(receipt?.owner).toBe("Developer app");
        const receiptCases = receipt?.variants?.map(
            (variant) => variant.params?.topup_case,
        );
        expect(receiptCases).not.toContain("after-payment");
        expect(receiptCases).not.toContain("after-budget");
        expect(receiptCases).not.toContain("canceled");
        for (const scenario of ["pending", "status-error"])
            expect(receiptCases).toContain(scenario);
        const confirm = screens.find(
            (screen) => screen.id === "add-pollen-amount",
        );
        const confirmationCases = confirm?.variants?.map(
            (variant) => variant.params?.topup_case,
        );
        for (const scenario of [
            "loading",
            "expired",
            "invalid-link",
            "reconnect",
            "account-error",
            "sign-in-error",
        ])
            expect(confirmationCases).toContain(scenario);
        expect(
            flowEdges.some(
                (edge) =>
                    edge.from === "add-pollen-checkout" &&
                    edge.to === "add-pollen-unchanged" &&
                    edge.label.includes("canceled"),
            ),
        ).toBe(true);
    });
    it("uses the resulting app budget, not the increment, to determine the shortfall", () => {
        const plan = addPollenPlan(10, 5, 20);
        expect(plan.resultingBudget).toBe(25);
        expect(plan.shortfall).toBe(15);
        expect(plan.pack?.amountUsd).toBe(20);
        expect(10 + (plan.pack?.amountUsd ?? 0)).toBe(30);
    });
    it("does not require a purchase when the account covers the increased budget", () => {
        expect(addPollenPlan(25, 5, 20)).toMatchObject({
            resultingBudget: 25,
            shortfall: 0,
            pack: undefined,
        });
        expect(addPollenPlan(40, 5, 20).pack).toBeUndefined();
    });
    it("never requires a purchase for a reduction or unchanged allowance", () => {
        for (const amount of [-5, -2, 0]) {
            expect(addPollenPlan(0, 5, amount)).toEqual({
                resultingBudget: 5 + amount,
                shortfall: 0,
                pack: undefined,
            });
        }
    });
    it("chooses the smallest sufficient pack and never invents a pack", () => {
        expect(addPollenPlan(10, 5, 10).pack?.amountUsd).toBe(5);
        expect(addPollenPlan(10, 5, 50).pack?.amountUsd).toBe(50);
        expect(addPollenPlan(10, 5, 100).pack?.amountUsd).toBe(100);
        expect(addPollenPlan(0, 5, 100).pack).toBeUndefined();
    });
    it.each([
        [1, 2],
        [2, 2],
        [3, 5],
        [5, 5],
        [6, 10],
        [11, 20],
    ])("covers a %i Pollen shortfall with the existing %i Pollen pack", (shortfall, expectedPack) => {
        const plan = addPollenPlan(5, 5, shortfall);
        expect(plan.pack?.amountUsd).toBe(expectedPack);
        expect(plan.resultingBudget).toBe(5 + shortfall);
    });
    it("keeps canceled and pending payments away from the budget-increase outcome", () => {
        const edges = (id: string) =>
            flowEdges.filter((edge) => edge.from === id);
        expect(
            edges("add-pollen-covered")
                .map((edge) => edge.to)
                .sort(),
        ).toEqual(["add-pollen-checkout", "add-pollen-increased"]);
        expect(edges("add-pollen-unchanged").map((edge) => edge.to)).toEqual([
            "app-connected",
        ]);
        expect(
            flowEdges
                .filter((edge) => edge.to === "add-pollen-increased")
                .map((edge) => edge.from)
                .sort(),
        ).toEqual(["add-pollen-covered"]);
        expect(
            flowEdges.find((edge) => edge.from === "add-pollen-credited")?.to,
        ).toBe("add-pollen-amount");
        expect(
            flowEdges
                .filter((edge) => edge.to === "add-pollen-credited")
                .every((edge) => edge.label === "Payment confirmed"),
        ).toBe(true);
        expect(
            edges("app-connected").some(
                (edge) => edge.to === "add-pollen-amount",
            ),
        ).toBe(true);
        expect(edges("app-connected").some((edge) => edge.to === "keys")).toBe(
            false,
        );
    });
});

const catalog = [
    { name: "official/free" },
    { name: "official/paid", paid_only: true },
    { name: "community/free", community: true },
];

describe("focused flow navigation", () => {
    it("includes shared sign-in in app, device, account and admin journeys", () => {
        for (const id of ["app", "device", "account", "admin"] as const) {
            const focus = getFlowFocus(id);
            for (const shared of [
                "sign-in",
                "github-login",
                "github-authorize",
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
    it("includes the connected app and top-up reauthentication without a dashboard detour", () => {
        const focus = getFlowFocus("add-pollen");
        expect(focus.nodeIds.has("app-connected")).toBe(true);
        expect(focus.nodeIds.has("sign-in")).toBe(false);
        expect(focus.nodeIds.has("github-login")).toBe(true);
        expect(focus.nodeIds.has("enter-connected")).toBe(false);
        expect(
            focus.edges.some(
                (edge) =>
                    edge.from === "app-connected" &&
                    edge.to === "add-pollen-amount",
            ),
        ).toBe(true);
        expect(
            focus.edges.some(
                (edge) =>
                    edge.from === "add-pollen-increased" &&
                    edge.to === "app-connected",
            ),
        ).toBe(true);
        expect(
            focus.edges.some(
                (edge) =>
                    edge.from === "add-pollen-unchanged" &&
                    edge.to === "app-connected",
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
                    edge.from === "cancelled" && edge.to === "device-result",
            ),
        ).toBe(true);
    });
    it("fits every participating card and every visible arrow, including outlying returns", () => {
        for (const section of flowSections) {
            const { nodes, edges, nodeIds, bounds } = getFlowFocus(section.id);
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
                expect(edgePoints(edge).every(([x, y]) => contains(x, y))).toBe(
                    true,
                );
            }
        }
    });
});

describe("authorization preview coverage", () => {
    it("connects every unique screen and preserves decision branches and retry loops", () => {
        const ids = new Set(flowNodes.map((node) => node.id));
        expect(ids.size).toBe(flowNodes.length);
        const screens = flowNodes.flatMap((node) =>
            node.screen ? [node.screen] : [],
        );
        expect(new Set(screens).size).toBe(screens.length);
        const represented = new Set([
            ...screens,
            ...[...appLoginScreens.values()].map((entry) =>
                entry.id.split("--")[0].replace(/-errors$/, ""),
            ),
        ]);
        expect([...represented].sort()).toEqual(
            canvasGroups
                .flatMap((group) => group.screens.map((screen) => screen.id))
                .sort(),
        );
        for (const edge of flowEdges) {
            expect(ids.has(edge.from)).toBe(true);
            expect(ids.has(edge.to)).toBe(true);
            expect(edgePoints(edge).flat().every(Number.isFinite)).toBe(true);
        }
        for (const node of flowNodes) {
            expect(
                flowEdges.some(
                    (edge) => edge.from === node.id || edge.to === node.id,
                ),
            ).toBe(true);
            if (node.kind === "decision")
                expect(
                    flowEdges.filter((edge) => edge.from === node.id).length,
                ).toBeGreaterThanOrEqual(2);
        }
        expect(
            flowEdges.some(
                (edge) =>
                    edge.from === "device-wait" && edge.to === "device-wait",
            ),
        ).toBe(true);
        expect(
            flowEdges.some(
                (edge) => edge.from === "consent" && edge.to === "cancelled",
            ),
        ).toBe(true);
        expect(
            flowEdges.some(
                (edge) => edge.from === "error" && edge.to === "github-session",
            ),
        ).toBe(true);
    });
    it("shows each screen once and supports scope combinations through request parameters", () => {
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
        for (let mask = 0; mask < 2 ** CONSENT_PERMISSIONS.length; mask++) {
            const scopes = CONSENT_PERMISSIONS.filter(
                (_, index) => mask & (1 << index),
            );
            const query = new URLSearchParams({
                request_scope: scopes.join(" "),
            });
            expect(previewAuthorizeParams(query).get("scope")).toBe(
                scopes.join(" "),
            );
        }
    });
    it("exposes every supported account scope and defaults to showing all disclosures", () => {
        expect(previewScopeOptions.map((option) => option.id).sort()).toEqual(
            [...CONSENT_PERMISSIONS].sort(),
        );
        const request = readPreviewRequest(new URLSearchParams());
        expect(request.scopes.sort()).toEqual([...CONSENT_PERMISSIONS].sort());
        expect(request.earnings).toBe(true);
    });

    for (let mask = 0; mask < 1 << CONSENT_PERMISSIONS.length; mask++) {
        const scopes = CONSENT_PERMISSIONS.filter(
            (_, index) => mask & (1 << index),
        );
        it(`preserves the scope combination: ${scopes.join(", ") || "none"}`, () => {
            const params = previewAuthorizeParams(
                new URLSearchParams({ request_scope: scopes.join(" ") }),
            );
            expect(
                getAuthorizeInitialPermissions({
                    permissions: parseScopeList(params.get("scope")),
                }).accountPermissions,
            ).toEqual(scopes.length ? scopes : null);
        });
    }

    it.each([
        ["selected", ["official/free", "official/paid"]],
        ["paid", ["official/paid"]],
        ["community", ["community/free"]],
        ["unlisted", ["unlisted-preview-model"]],
    ])("sends %s model IDs in the route's comma-separated format", (mode, ids) => {
        const params = previewAuthorizeParams(
            new URLSearchParams({ request_models: mode }),
            catalog,
        );
        expect(params.get("models")?.split(",")).toEqual(ids);
    });

    it("does not silently grant all models if the restricted example cannot load", () => {
        expect(() =>
            previewAuthorizeParams(
                new URLSearchParams({ request_models: "paid" }),
                [],
            ),
        ).toThrow();
    });

    it("keeps funding status independent from model selection", () => {
        expect(
            previewAuthorizeParams(
                new URLSearchParams({ badge: "paid-required" }),
                catalog,
            ).has("models"),
        ).toBe(false);
    });

    it("preserves zero and fractional budgets and uses production defaults when omitted", () => {
        expect(
            previewAuthorizeParams(
                new URLSearchParams({
                    request_budget: "0",
                    request_expiry: "0.5",
                }),
            ).get("budget"),
        ).toBe("0");
        expect(
            previewAuthorizeParams(
                new URLSearchParams({
                    request_budget: "0.25",
                    request_expiry: "0.5",
                }),
            ).get("expiry"),
        ).toBe("0.5");
        const params = previewAuthorizeParams(
            new URLSearchParams({ request_budget: "", request_expiry: "" }),
        );
        expect(params.has("budget")).toBe(false);
        expect(params.has("expiry")).toBe(false);
    });
});

describe("Connect lab journey", () => {
    const go = (state: JourneyState, to: string, label?: string) => {
        const edge = journeyOptions(state).find(
            (edge) => edge.to === to && (!label || edge.label.includes(label)),
        );
        if (!edge) throw new Error(`No route from ${state.node} to ${to}`);
        return journeyStep(state, edge);
    };
    const confirm = (state: JourneyState) =>
        go(
            { ...go(state, "add-pollen-amount"), amount: 20 },
            "add-pollen-covered",
        );
    it("opens one hosted selector and signs in first when the Enter session expired", () => {
        const state = { ...startJourney("topup"), signedIn: false };
        const next = go(state, "add-pollen-amount");
        expect(next.node).toBe("github-session");
        expect(next.amount).toBe(5);
        expect(
            canvasGroups
                .flatMap((group) => group.screens)
                .find((screen) => screen.id === "add-pollen-amount")?.owner,
        ).toBe("Pollinations");
        expect(flowNodes.some((node) => node.id === "add-pollen-confirm")).toBe(
            false,
        );
    });
    it("reuses a Pollinations session but keeps app connection independent", () => {
        const start = { ...startJourney(), signedIn: true };
        expect(go(start, "loading").node).toBe("loading");
        const connected = { ...start, node: "app-connected", connected: true };
        const disconnected = go(connected, "app-connect");
        expect(disconnected).toMatchObject({
            signedIn: true,
            connected: false,
        });
        expect(go(disconnected, "loading").node).toBe("loading");
    });
    it("signs in before returning to the chosen entrance", () => {
        let state = go(startJourney(), "loading");
        expect(state.node).toBe("loading");
        state = go(state, "app-sign-in-checking");
        state = go(state, "sign-in");
        state = go(state, "app-signing-in");
        state = go(state, "github-session");
        state = go(state, "github-approval");
        state = go(state, "loading");
        expect(state).toMatchObject({ node: "loading", signedIn: true });
        state = go(state, "app-checking");
        state = go(state, "consent");
        expect(state).toMatchObject({ node: "consent", signedIn: true });
        expect(
            go({ ...state, node: "loading", world: "device" }, "resume").node,
        ).toBe("device-code");
        expect(
            go({ ...state, node: "loading", world: "account" }, "resume").node,
        ).toBe("enter-connected");
    });
    it("offers enough-funds and purchase branches for the chosen increase", () => {
        const amount = {
            ...startJourney("topup"),
            node: "add-pollen-amount",
            amount: 50,
        };
        const covered = withJourneyCondition(amount, "covered");
        expect(covered.paid + covered.quest).toBe(55);
        const funded = go(covered, "add-pollen-covered");
        expect(funded).toMatchObject({
            node: "app-connected",
            budget: 55,
            purchased: 0,
        });
        const shortfall = withJourneyCondition(amount, "shortfall");
        expect(go(shortfall, "add-pollen-covered")).toMatchObject({
            node: "add-pollen-checkout",
            budget: 5,
            checkoutPack: 100,
        });
    });
    it("preserves the selected larger pack through checkout and credits it without enlarging the requested allowance", () => {
        const start = {
            ...startJourney("topup"),
            node: "add-pollen-amount",
            paid: 14,
            quest: 0,
            budget: 5,
            amount: 20,
            checkoutPack: 50,
        };
        const checkout = go(start, "add-pollen-covered");
        expect(checkout).toMatchObject({
            node: "add-pollen-checkout",
            amount: 20,
            budget: 5,
            checkoutPack: 50,
        });
        expect(go(checkout, "add-pollen-credited")).toMatchObject({
            paid: 64,
            budget: 5,
            node: "add-pollen-amount",
            purchased: 50,
        });
        expect(addPollenPlan(14, 5, 20, 10).pack?.amountUsd).toBe(20);
        expect(addPollenPlan(14, 5, 20, 30).pack?.amountUsd).toBe(20);
        expect(addPollenPlan(30, 5, 20, 50).pack).toBeUndefined();
    });
    it("buys account Pollen without changing an app budget", () => {
        const start = {
            ...startJourney("account"),
            node: "enter-connected",
            signedIn: true,
            checkoutPack: 20,
        };
        const checkout = go(start, "account-checkout");
        const paid = go(checkout, "enter-connected", "Payment confirmed");
        expect(paid).toMatchObject({
            paid: 30,
            quest: 5,
            budget: 5,
            payment: "completed",
        });
        expect(getFlowFocus("account").nodeIds.has("account-checkout")).toBe(
            true,
        );
    });
    it("keeps account purchases unchanged while pending or canceled", () => {
        const start = {
            ...startJourney("account"),
            node: "enter-connected",
            signedIn: true,
            checkoutPack: 5,
        };
        const checkout = go(start, "account-checkout");
        const pending = go(checkout, "account-checkout", "Payment pending");
        expect(pending).toMatchObject({
            paid: 10,
            quest: 5,
            budget: 5,
            payment: "pending",
        });
        const canceled = go(pending, "enter-connected", "Canceled");
        expect(canceled).toMatchObject({
            paid: 10,
            quest: 5,
            budget: 5,
            payment: "canceled",
        });
    });
    it("retries a failed account purchase and credits a confirmed payment once", () => {
        const start = {
            ...startJourney("account"),
            node: "account-checkout",
            checkoutPack: 5,
        };
        const failed = go(start, "account-checkout", "Payment failed");
        expect(failed).toMatchObject({
            paid: 10,
            budget: 5,
            scenario: "checkout-error",
        });
        const paid = go(failed, "enter-connected", "Payment confirmed");
        expect(paid.paid).toBe(15);
        expect(
            go(
                { ...paid, node: "account-checkout" },
                "enter-connected",
                "Payment confirmed",
            ).paid,
        ).toBe(15);
    });
    it("increases a covered budget without moving or spending Pollen", () => {
        const state = confirm({ ...startJourney("topup"), paid: 40 });
        expect(state).toMatchObject({
            paid: 40,
            quest: 5,
            budget: 25,
            purchased: 0,
            payment: "completed",
            node: "app-connected",
        });
    });
    it("saves reductions down to zero without changing the wallet", () => {
        for (const amount of [-2, -5]) {
            const editing = {
                ...go(
                    { ...startJourney("topup"), paid: 0, quest: 0 },
                    "add-pollen-amount",
                ),
                amount,
            };
            const saved = go(editing, "add-pollen-covered");
            expect(saved).toMatchObject({
                node: "app-connected",
                budget: 5 + amount,
                paid: 0,
                quest: 0,
                purchased: 0,
            });
            expect(go(saved, "add-pollen-amount")).toMatchObject({
                budget: 5 + amount,
                amount: 5,
            });
        }
    });
    it("waits for payment confirmation, then credits the smallest pack exactly once", () => {
        let state = confirm({ ...startJourney("topup"), quest: 0 });
        expect(state).toMatchObject({
            node: "add-pollen-checkout",
            paid: 10,
            budget: 5,
        });
        state = go(state, "add-pollen-pending", "pending");
        state = go(state, "add-pollen-pending");
        expect(state).toMatchObject({
            paid: 10,
            budget: 5,
            payment: "pending",
        });
        const edge = journeyOptions(state).find(
            (edge) => edge.to === "add-pollen-credited",
        );
        if (!edge) throw new Error("Missing payment confirmation route");
        state = journeyStep(state, edge);
        expect(state).toMatchObject({
            paid: 30,
            budget: 5,
            purchased: 20,
            payment: "completed",
        });
        expect(journeyStep(state, edge)).toEqual(state);
        expect(state.node).toBe("add-pollen-amount");
        expect(go(state, "add-pollen-covered")).toMatchObject({
            node: "app-connected",
            budget: 25,
            paid: 30,
        });
    });
    it("retains the reviewed pack if the account changes while checkout is pending", () => {
        let state = confirm({ ...startJourney("topup"), quest: 0 });
        state = go(state, "add-pollen-pending", "pending");
        state = { ...state, paid: 40, budget: 4 };
        state = go(state, "add-pollen-credited");
        expect(state).toMatchObject({
            paid: 60,
            purchased: 20,
            budget: 4,
            payment: "completed",
        });
    });
    it("keeps the chosen amount after a failed start", () => {
        const state = {
            ...go(startJourney("topup"), "add-pollen-amount"),
            amount: 50,
        };
        expect(go(state, "add-pollen-amount")).toMatchObject({
            amount: 50,
            scenario: "start-error",
        });
    });
    it("can top up a covered account without saving the selected app budget", () => {
        let state = {
            ...go(startJourney("topup"), "add-pollen-amount"),
            amount: 5,
            checkoutPack: 10,
        };
        state = go(state, "add-pollen-checkout");
        expect(state).toMatchObject({
            payment: "pending",
            budget: 5,
            checkoutPack: 10,
        });
        state = go(state, "add-pollen-credited");
        expect(state).toMatchObject({
            node: "add-pollen-amount",
            paid: 20,
            quest: 5,
            budget: 5,
            amount: 5,
        });
        const saved = go(state, "add-pollen-covered");
        expect(saved).toMatchObject({
            node: "app-connected",
            paid: 20,
            quest: 5,
            budget: 10,
        });
    });
    it("never credits or raises a canceled purchase", () => {
        const state = go(
            confirm(startJourney("topup")),
            "add-pollen-unchanged",
            "canceled",
        );
        expect(state).toMatchObject({
            paid: 10,
            quest: 5,
            budget: 5,
            payment: "canceled",
            node: "app-connected",
            connected: true,
        });
        expect(
            journeyOptions(state).some(
                (edge) => edge.to === "add-pollen-credited",
            ),
        ).toBe(false);
        expect(go(state, "add-pollen-amount")).toMatchObject({
            payment: "idle",
            node: "add-pollen-amount",
            budget: 5,
        });
    });
    it("requires sign-in after an expired top-up session and returns to the hosted selector", () => {
        let state = go(startJourney("topup"), "add-pollen-amount");
        state = go(state, "github-session");
        expect(state.signedIn).toBe(false);
        state = go(go(go(state, "github-approval"), "loading"), "resume");
        expect(state).toMatchObject({
            node: "add-pollen-amount",
            world: "topup",
            signedIn: true,
        });
    });
    it("keeps denied device results on the denied branch", () => {
        const state = go(
            { ...startJourney("device"), node: "cancelled", denied: true },
            "device-result",
        );
        expect(journeyOptions(state).map((edge) => edge.to)).toEqual([
            "device-stopped",
        ]);
    });
    it("derives wallet warnings and preserves the app budget distinction", () => {
        expect(
            journeyFunding({ ...startJourney(), budget: 0 }),
        ).toBeUndefined();
        expect(
            journeyFunding({ ...startJourney(), paid: 0, quest: 0 })?.state,
        ).toBe("no-pollen");
        expect(
            journeyFunding({ ...startJourney(), paid: 0, paidOnly: true })
                ?.state,
        ).toBe("paid-required");
        expect(journeyFunding({ ...startJourney(), paid: 0 })).toBeUndefined();
        expect(
            journeyFunding({ ...startJourney(), paid: 0.2, quest: 0.2 }),
        ).toBeUndefined();
    });
    it("consumes both account funds and app budget, and never spends Quest on a paid-only model", () => {
        const start = startJourney("topup");
        expect(simulateUsage(start)).toMatchObject({
            paid: 10,
            quest: 4,
            budget: 4,
        });
        expect(simulateUsage({ ...start, paidOnly: true })).toMatchObject({
            paid: 9,
            quest: 5,
            budget: 4,
        });
        expect(
            simulateUsage({ ...start, paid: 0, paidOnly: true }),
        ).toMatchObject({ paid: 0, quest: 5, budget: 5 });
        expect(simulateUsage({ ...start, budget: 0 })).toMatchObject({
            paid: 10,
            quest: 5,
            budget: 0,
        });
    });
});

describe("automatic journey routing", () => {
    const advance = (
        state: JourneyState,
        to: string,
        settings = defaultJourneySettings,
    ) => {
        const edge = journeyOptions(state).find((item) => item.to === to);
        if (!edge) throw new Error(`Missing action: ${state.node} → ${to}`);
        let next = journeyAdvance(state, edge, settings);
        // Simulate completion of the visible pending screens; the player waits
        // for each iframe to load before applying these same transitions.
        for (let i = 0; i < 8 && next.world === "app"; i++) {
            const destination = appLoginAutomaticDestination(next, settings);
            if (!destination) return next;
            const route = journeyOptions(next).find(
                (edge) => edge.to === destination,
            );
            if (!route)
                throw new Error(
                    `Missing completion: ${next.node} → ${destination}`,
                );
            next = journeyAdvance(next, route, settings);
        }
        return next;
    };
    it("signs in from the dashboard drawer and navigates between Pollen and keys", () => {
        const login = advance(startJourney("account"), "github-session", {
            ...defaultJourneySettings,
            githubSignedIn: false,
        });
        expect(login.node).toBe("github-login");
        const account = advance(login, "github-approval");
        expect(account).toMatchObject({
            node: "enter-connected",
            signedIn: true,
        });
        const keys = advance(account, "keys");
        expect(keys.node).toBe("keys");
        expect(advance(keys, "enter-connected")).toMatchObject({
            node: "enter-connected",
            signedIn: true,
        });
        expect(advance(keys, "enter-signed-out")).toMatchObject({
            node: "enter-signed-out",
            signedIn: false,
        });
    });
    it("uses one provider handoff for GitHub signup and resumes authorization", () => {
        const login = {
            ...startJourney(),
            node: "github-login",
            paid: 0,
            quest: 0,
        };
        const signup = advance(login, "github-signup");
        expect(advance(signup, "github-login")).toMatchObject({
            node: "github-login",
            signedIn: false,
        });
        const approval = advance(signup, "github-authorize");
        expect(approval).toMatchObject({
            node: "github-authorize",
            signedIn: false,
        });
        expect(advance(approval, "loading")).toMatchObject({
            node: "consent",
            signedIn: true,
            connected: false,
            paid: 0,
            quest: 0,
        });
        for (const removed of [
            "google-account",
            "github-profile",
            "email-verify",
        ])
            expect(getFlowFocus("app").nodeIds.has(removed)).toBe(false);
    });
    it("keeps dashboard navigation in the account flow after arriving from an app", () => {
        const account = advance(
            {
                ...startJourney(),
                node: "app-connected",
                signedIn: true,
                connected: true,
            },
            "app-home",
        );
        expect(account.world).toBe("account");
        const signedOut = advance(account, "enter-signed-out");
        expect(advance(signedOut, "github-session")).toMatchObject({
            node: "enter-connected",
            world: "account",
            signedIn: true,
        });
    });
    it("skips GitHub UI when its session and approval are already present", () => {
        const signIn = { ...startJourney(), node: "sign-in" };
        expect(advance(signIn, "app-signing-in")).toMatchObject({
            node: "consent",
            signedIn: true,
        });
    });
    it("shows only the GitHub steps that are needed", () => {
        const signIn = { ...startJourney(), node: "sign-in" };
        const settings = {
            ...defaultJourneySettings,
            githubSignedIn: false,
            githubApproved: false,
        };
        const login = advance(signIn, "app-signing-in", settings);
        expect(login.node).toBe("github-login");
        const approval = advance(login, "github-approval", settings);
        expect(approval.node).toBe("github-authorize");
        expect(advance(approval, "loading", settings)).toMatchObject({
            node: "consent",
            signedIn: true,
        });
        expect(
            advance(signIn, "app-signing-in", {
                ...settings,
                githubSignedIn: true,
            }).node,
        ).toBe("github-authorize");
    });
    it("takes admin identity sign-in straight through GitHub", () => {
        const admin = { ...startJourney("admin"), node: "identity" };
        expect(advance(admin, "github-session")).toMatchObject({
            node: "dashboard-connected",
            signedIn: true,
        });
        expect(
            advance(admin, "github-session", {
                ...defaultJourneySettings,
                githubSignedIn: false,
            }).node,
        ).toBe("github-login");
    });
    it("uses a Pollinations session without any intermediate decision screen", () => {
        expect(
            advance({ ...startJourney(), signedIn: true }, "loading").node,
        ).toBe("consent");
    });
    it("returns to the real app immediately on cancellation", () => {
        expect(
            advance(
                { ...startJourney("topup"), node: "add-pollen-amount" },
                "add-pollen-unchanged",
            ).node,
        ).toBe("app-connected");
        expect(
            advance({ ...startJourney(), node: "consent" }, "cancelled").node,
        ).toBe("app-callback-error");
    });
    it("shows real error states when error simulation is enabled", () => {
        const settings = { ...defaultJourneySettings, errors: true };
        expect(
            advance(
                { ...startJourney(), node: "sign-in" },
                "app-signing-in",
                settings,
            ).node,
        ).toBe("error");
        expect(
            advance({ ...startJourney(), signedIn: true }, "loading", {
                ...settings,
                appRequestError: "redirect",
            }).node,
        ).toBe("blocked");
        expect(
            advance(
                { ...startJourney("device"), node: "device-code" },
                "code-valid",
                settings,
            ),
        ).toMatchObject({ node: "device-code", scenario: "device-invalid" });
    });
    it("resolves admin access and device validation automatically", () => {
        const admin = {
            ...startJourney("admin"),
            node: "identity",
            signedIn: true,
        };
        expect(advance(admin, "github-session").node).toBe(
            "dashboard-connected",
        );
        expect(
            advance(admin, "github-session", {
                ...defaultJourneySettings,
                adminAccess: false,
            }).node,
        ).toBe("dashboard-denied");
        expect(
            advance(
                { ...startJourney("device"), node: "device-code" },
                "code-valid",
            ).node,
        ).toBe("consent");
    });
});

describe("remembered journey sections", () => {
    it("preserves app progress while reading the latest shared account balance", () => {
        const saved = {
            ...startJourney(),
            node: "app-connected",
            signedIn: true,
            connected: true,
            budget: 20,
        };
        const current = {
            ...startJourney("account"),
            signedIn: true,
            paid: 42,
            quest: 7,
        };
        expect(restoreJourney(saved, current)).toMatchObject({
            node: "app-connected",
            connected: true,
            budget: 20,
            paid: 42,
            quest: 7,
            signedIn: true,
        });
    });
    it("opens the signed-in dashboard without repeating sign-in", () => {
        expect(
            restoreJourney(startJourney("account"), {
                ...startJourney(),
                signedIn: true,
            }).node,
        ).toBe("enter-connected");
    });
    it("invalidates each protected section after a shared sign-out", () => {
        for (const [world, node, destination] of [
            ["app", "app-connected", "app-connect"],
            ["device", "device-code", "device-start"],
            ["account", "keys", "enter-signed-out"],
            ["admin", "dashboard-connected", "dashboard-sign-in"],
        ] as const) {
            const saved = {
                ...startJourney(world),
                node,
                signedIn: true,
                connected: true,
            };
            const restored = restoreJourney(saved, startJourney());
            expect(restored).toMatchObject({
                node: destination,
                signedIn: false,
                connected: false,
            });
        }
    });
    it("going back does not undo a purchase or resurrect a session", () => {
        const previous = {
            ...startJourney("account"),
            node: "keys",
            signedIn: true,
        };
        const current = { ...startJourney("account"), paid: 35, quest: 2 };
        expect(restoreJourney(previous, current)).toMatchObject({
            node: "enter-signed-out",
            paid: 35,
            quest: 2,
            signedIn: false,
        });
    });
});
