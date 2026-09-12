import {
    CONSENT_PERMISSIONS,
    getAuthorizeInitialPermissions,
    parseScopeList,
} from "@shared/auth/authorize-config.ts";
import { describe, expect, it } from "vitest";
import {
    appLoginAutomaticDestination,
    appLoginScreens,
} from "../frontend/pollen-connect-app-login";
import {
    canvasGroups,
    canvasScreenUrl,
} from "../frontend/pollen-connect-canvas-data";
import { dashboardScreens } from "../frontend/pollen-connect-dashboard";
import {
    deviceAutomaticDestination,
    getDeviceFlow,
} from "../frontend/pollen-connect-device";
import {
    edgePoints,
    flowEdges,
    flowNodes,
    flowSections,
    getFlowFocus,
    nodeSize,
} from "../frontend/pollen-connect-diagram";
import {
    applyJourneyConsent,
    defaultJourneySettings,
    type JourneyState,
    journeyAdvance,
    journeyFunding,
    journeyOptions,
    journeyStep,
    restoreJourney,
    simulateUsage,
    startJourney,
} from "../frontend/pollen-connect-journey-state";
import {
    previewAuthorizeParams,
    previewScopeOptions,
    readPreviewRequest,
} from "../frontend/pollen-connect-request-config";

describe("consent carried through the app journey", () => {
    it.each([
        {
            generationEnabled: false,
            allowedModels: null,
            pollenBudget: 5,
            expiryDays: 2,
            expectedBudget: 0,
        },
        {
            generationEnabled: true,
            allowedModels: [],
            pollenBudget: 5,
            expiryDays: 2,
            expectedBudget: 0,
        },
        {
            generationEnabled: true,
            allowedModels: ["selected-model"],
            pollenBudget: 0.5,
            expiryDays: 0.5,
            expectedBudget: 0.5,
        },
        {
            generationEnabled: true,
            allowedModels: null,
            pollenBudget: null,
            expiryDays: null,
            expectedBudget: Number.POSITIVE_INFINITY,
        },
    ])("preserves the exact consent during approval: %j", ({
        expectedBudget,
        ...values
    }) => {
        const consent = { ...values, accountPermissions: ["profile"] };
        const state = applyJourneyConsent(
            { ...startJourney(), node: "consent", signedIn: true },
            consent,
        );
        const allow = journeyOptions(state).find(
            (edge) => edge.label === "Allow access",
        );
        if (!allow) throw new Error("Missing approval action");
        const connecting = journeyStep(state, allow);
        expect(connecting.node).toBe("app-connecting");
        expect(connecting.consent).toEqual(consent);
        expect(JSON.parse(JSON.stringify(connecting.consent))).toEqual(consent);
        expect(connecting.budget).toBe(expectedBudget);
        expect(connecting.sharesUsage).toBe(false);
        const failed = journeyOptions(connecting).find(
            (edge) => edge.to === "app-connection-failed",
        );
        if (!failed) throw new Error("Missing approval failure");
        expect(journeyStep(connecting, failed).consent).toEqual(consent);
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
                expect(
                    edgePoints(edge, nodes).every(([x, y]) => contains(x, y)),
                ).toBe(true);
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
            // Dashboard registration is a variant of the shared create dialog.
            ...screens.map((id) =>
                ["app-key", "api-key", "key-edit", "key-delete"].includes(id)
                    ? "keys"
                    : id,
            ),
            ...dashboardScreens.map((entry) => entry.id),
            "device-start",
            "device-done",
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
            getDeviceFlow().edges.some(
                (edge) =>
                    edge.from === "device-result" &&
                    edge.to === "device-done" &&
                    edge.label === "Device retrieves key",
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
        state = go(state, "github-handoff");
        state = go(state, "loading");
        expect(state).toMatchObject({ node: "loading", signedIn: true });
        state = go(state, "app-checking");
        state = go(state, "consent");
        expect(state).toMatchObject({ node: "consent", signedIn: true });
        expect(
            go(
                { ...state, node: "device-session", world: "device" },
                "device-code",
            ).node,
        ).toBe("device-code");
        expect(
            go({ ...state, node: "loading", world: "account" }, "resume").node,
        ).toBe("enter-connected");
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
    it("keeps denied device results on the denied branch", () => {
        const state = go(
            { ...startJourney("device"), node: "device-denying", denied: true },
            "device-declined",
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
        for (let i = 0; i < 8 && ["app", "device"].includes(next.world); i++) {
            const destination = (
                next.world === "device"
                    ? deviceAutomaticDestination
                    : appLoginAutomaticDestination
            )(next, settings);
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
    it("returns from the external GitHub handoff without modeling provider pages", () => {
        const handoff = {
            ...startJourney(),
            node: "github-handoff",
            paid: 0,
            quest: 0,
        };
        expect(advance(handoff, "loading")).toMatchObject({
            node: "consent",
            signedIn: true,
            connected: false,
            paid: 0,
            quest: 0,
        });
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
    it("leaves provider session and approval decisions to GitHub", () => {
        const signIn = { ...startJourney(), node: "sign-in" };
        for (const githubSignedIn of [false, true])
            for (const githubApproved of [false, true]) {
                const settings = {
                    ...defaultJourneySettings,
                    githubSignedIn,
                    githubApproved,
                };
                const handoff = advance(signIn, "app-signing-in", settings);
                expect(handoff).toMatchObject({
                    node: "github-handoff",
                    signedIn: false,
                });
                expect(advance(handoff, "loading", settings)).toMatchObject({
                    node: "consent",
                    signedIn: true,
                });
            }
    });
    it("uses a Pollinations session without any intermediate decision screen", () => {
        expect(
            advance({ ...startJourney(), signedIn: true }, "loading").node,
        ).toBe("consent");
    });
    it("returns to the real app immediately on cancellation", () => {
        expect(
            advance({ ...startJourney(), node: "consent" }, "cancelled").node,
        ).toBe("app-callback-error");
    });
    it("uses the failure setting for the relevant auth stage", () => {
        const settings = { ...defaultJourneySettings, errors: true };
        expect(
            advance({ ...startJourney(), node: "sign-in" }, "app-signing-in", {
                ...settings,
                loginResult: "start",
            }).node,
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
                "device-verifying",
                { ...settings, deviceCodeResult: "invalid" },
            ),
        ).toMatchObject({ node: "device-code-invalid" });
        expect(
            appLoginAutomaticDestination(
                { ...startJourney(), node: "app-signing-in" },
                settings,
            ),
        ).toBe("github-handoff");
        expect(
            appLoginAutomaticDestination(
                { ...startJourney(), node: "app-connecting" },
                settings,
            ),
        ).toBe("app-callback");
    });
    it("resolves device validation automatically", () => {
        expect(
            advance(
                { ...startJourney("device"), node: "device-code" },
                "device-verifying",
            ).node,
        ).toBe("consent");
    });
});

describe("remembered journey sections", () => {
    it("keeps the chosen protocol when returning to a previous step", () => {
        const current = { ...startJourney(), method: "direct" as const };
        expect(restoreJourney(startJourney(), current).method).toBe("direct");
    });
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
