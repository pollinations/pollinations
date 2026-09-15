import { describe, expect, it } from "vitest";
import { defaultConditions, reviewConditions } from "../conditions-data";
import { appLoginNodes, appLoginScreens } from "../pollen-connect-app-login";
import {
    dashboardSectionForScreen,
    dashboardSections,
} from "../pollen-connect-dashboard";
import { getDeviceFlow } from "../pollen-connect-device";
import { getFlowFocus } from "../pollen-connect-diagram";
import { galleryScreensForFlow } from "../pollen-connect-gallery-data";
import type {
    JourneyEntrance,
    JourneySection,
} from "../pollen-connect-journey-state";
import {
    isJourneySituation,
    journeySituation,
    journeyStartCase,
    reviewCaseForNode,
    reviewCaseForScreen,
    reviewCasesForFlow,
    reviewFlows,
    reviewPageForLocation,
    reviewPageForNode,
    situationLabel,
} from "../review-inventory";
import { screenRoute } from "../screen-route";

describe("shared review inventory", () => {
    it("gives every situation a distinct, descriptive label within its page", () => {
        for (const { flow, section, cases } of reviewFlows) {
            for (const page of galleryScreensForFlow(flow, section)) {
                const labels = cases
                    .filter((recipe) => recipe.pageId === page.id)
                    .map((recipe) => situationLabel(recipe, page));
                for (const label of labels) {
                    expect(label, `${flow}/${section}/${page.id}`).not.toMatch(
                        /^(Normal|Ready|Default|Empty|Populated|Failed|Loading|Available|Saving|Saved|Deleting|Submitting)$/i,
                    );
                    expect(label.length, label).toBeLessThanOrEqual(26);
                    expect(
                        label,
                        `${flow}/${section}/${page.id}`,
                    ).not.toContain(" · ");
                }
                expect(
                    new Set(labels).size,
                    `${flow}/${section}/${page.id}`,
                ).toBe(labels.length);
            }
        }
    });

    it("describes the actual balance, collection and form situations", () => {
        for (const [flow, section, pageId, labels] of [
            [
                "app",
                "main",
                "consent",
                ["Paid Pollen available", "No Pollen", "Paid Pollen required"],
            ],
            [
                "app",
                "topup",
                "account-wallet",
                ["Paid Pollen available", "Quest Pollen only", "Wallet empty"],
            ],
            ["account", "keys", "keys", ["Keys available", "No keys"]],
            ["account", "apps", "apps", ["Apps available", "No apps"]],
            [
                "account",
                "keys",
                "key-create",
                [
                    "New key form",
                    "Creating key",
                    "Key creation failed",
                    "Key created",
                ],
            ],
        ] as const) {
            const page = galleryScreensForFlow(flow, section).find(
                (entry) => entry.id === pageId,
            );
            if (!page) throw new Error(`Missing ${pageId}`);
            expect(
                reviewCasesForFlow(flow, section)
                    .filter((recipe) => recipe.pageId === pageId)
                    .map((recipe) => situationLabel(recipe, page)),
            ).toEqual(expect.arrayContaining(labels));
        }
    });

    it("starts at the original journey entry with the chosen setup, without replaying actions", () => {
        const selected = reviewCasesForFlow("app", "main").find(
            (recipe) => recipe.id === "consent-paid-required",
        );
        if (!selected) throw new Error("Missing paid-only consent");
        const before = structuredClone(selected);
        for (const { flow, section, cases } of reviewFlows) {
            const start = journeyStartCase(
                {
                    flow: flow as JourneyEntrance,
                    section: section as JourneySection,
                },
                selected,
            );
            expect(start.id).toBe(cases[0].id);
            expect(start.query).toEqual(cases[0].query);
            expect(start.conditions).toEqual(selected.conditions);
            expect(start.prepare).toEqual(selected.prepare ?? cases[0].prepare);
            expect(start.steps).toBeUndefined();
            expect(start.action).toBeUndefined();
        }
        expect(selected).toEqual(before);
    });

    it("retains request failures and starting account setup without replaying later form submissions", () => {
        const cases = reviewCasesForFlow("app", "main");
        for (const selected of cases) {
            const start = journeyStartCase(
                { flow: "app", section: "main" },
                selected,
            );
            expect(start.requests).toEqual(selected.requests);
            expect(start.steps).toBeUndefined();
            expect(start.action).toBeUndefined();
        }
        expect(
            journeyStartCase({ flow: "app", section: "main" }).conditions,
        ).toEqual(cases[0].conditions);
        const allowance = reviewCasesForFlow("app", "topup").find(
            (recipe) =>
                recipe.pageId === "account-app" &&
                recipe.variant === "Limit reached",
        );
        expect(allowance?.conditions.allowance).toBe("exhausted");
    });

    it("keeps account conditions and recovery choices in Journey while leaving loading states in Screens", () => {
        const cases = reviewCasesForFlow("app", "main");
        const connection = cases.filter(
            (recipe) => recipe.pageId === "app-connected",
        );
        expect(
            connection
                .filter(isJourneySituation)
                .map((recipe) => recipe.variant),
        ).toEqual([
            "Connected",
            "Connection not completed",
            "Connection check unavailable",
            "Account details unavailable",
            "Limit reached",
        ]);
        expect(connection.map((recipe) => recipe.variant)).toContain(
            "Checking connection",
        );
        expect(connection.map((recipe) => recipe.variant)).toContain(
            "Loading account",
        );
        const consent = cases.filter(
            (recipe) =>
                recipe.pageId === "consent" && isJourneySituation(recipe),
        );
        expect(consent.map((recipe) => recipe.id)).toEqual([
            "consent",
            "consent-no-pollen",
            "consent-paid-required",
            "consent-models-error",
        ]);
    });

    it("opens an existing runnable case when entering Journey from a frozen preview", () => {
        const cases = reviewCasesForFlow("app", "main");
        for (const [from, to] of [
            ["app-signing-in", "sign-in"],
            ["app-checking", "sign-in"],
            ["app-connected-1", "app-connected-0"],
            ["loading", "app-connect"],
            ["consent-no-pollen", "consent-no-pollen"],
            ["consent-models-error", "consent-models-error"],
        ]) {
            const selected = cases.find((recipe) => recipe.id === from);
            if (!selected) throw new Error(`Missing ${from}`);
            expect(journeySituation(cases, selected)).toBe(
                cases.find((recipe) => recipe.id === to),
            );
        }
    });

    it("keeps real waiting conditions and excludes held requests introduced by later steps", () => {
        for (const section of ["main", "link"])
            expect(
                reviewCasesForFlow("device", section)
                    .filter(isJourneySituation)
                    .map((recipe) => recipe.id),
            ).toContain("device-code");
        const wallet = reviewCasesForFlow("account", "topup").filter(
            isJourneySituation,
        );
        expect(wallet.map((recipe) => recipe.variant)).toContain(
            "Payment pending",
        );
        expect(wallet.map((recipe) => recipe.variant)).not.toContain(
            "Saving auto top-up",
        );
        for (const { cases } of reviewFlows)
            for (const selected of cases)
                expect(cases).toContain(journeySituation(cases, selected));
    });

    it("has an executable case for every declared review state", () => {
        for (const { flow, section, cases } of reviewFlows) {
            if (flow === "device") {
                for (const entry of getDeviceFlow(
                    section as "main" | "link",
                ).screens.values())
                    if (!entry.illustration)
                        expect(
                            cases.some((recipe) => recipe.id === entry.id),
                            `${flow}/${section}/${entry.id}`,
                        ).toBe(true);
                continue;
            }
            for (const page of galleryScreensForFlow(
                flow as JourneyEntrance,
                section as JourneySection,
            )) {
                if (page.owner === "GitHub" || page.owner === "Stripe")
                    continue;
                for (const variant of page.variants ?? [{ label: page.title }])
                    expect(
                        cases.some(
                            (recipe) =>
                                recipe.pageId === page.id &&
                                recipe.variant === variant.label,
                        ),
                        `${flow}/${section}/${page.id}/${variant.label}`,
                    ).toBe(true);
            }
        }
    });

    it("covers every navigation section with real routes and expected content", () => {
        expect(reviewFlows).toHaveLength(dashboardSections.length + 5);
        for (const flow of reviewFlows) {
            const pages = galleryScreensForFlow(
                flow.flow as JourneyEntrance,
                flow.section as JourneySection,
            );
            const cases = reviewCasesForFlow(flow.flow, flow.section);
            expect(
                cases.length,
                `${flow.flow}/${flow.section}`,
            ).toBeGreaterThan(0);
            expect(new Set(cases.map(({ id }) => id)).size).toBe(cases.length);
            for (const recipe of cases) {
                expect(
                    pages.some(({ id }) => id === recipe.pageId),
                    recipe.id,
                ).toBe(true);
                expect(recipe.expected.length, recipe.id).toBeGreaterThan(0);
                if (
                    !pages
                        .find(({ id }) => id === recipe.pageId)
                        ?.owner.match(/GitHub|Stripe/)
                ) {
                    expect(
                        screenRoute(
                            new URLSearchParams(recipe.query),
                            {
                                connection: {
                                    clientId: "pk_public_test_app",
                                    keyId: "review-key",
                                    allowance: 5,
                                    enabled: true,
                                },
                                admin: {
                                    clientId: "pk_public_test_admin",
                                    registered: true,
                                },
                                device: null,
                            },
                            "http://localhost:4180",
                        ),
                        recipe.id,
                    ).toBeDefined();
                }
            }
        }
    });

    it("preserves the App sign-in retry and exit as different destinations", () => {
        const edges = getFlowFocus("app", "main").edges.filter(
            (edge) => edge.from === "login-failed",
        );
        expect(edges).toContainEqual(
            expect.objectContaining({
                label: "Try again",
                to: "app-signing-in",
            }),
        );
        expect(edges).toContainEqual(
            expect.objectContaining({ label: "Back to app", to: "cancelled" }),
        );
    });
    it("identifies a specific device error before its containing family", () => {
        for (const section of ["main", "link"]) {
            const cases = reviewCasesForFlow("device", section);
            for (const id of [
                "device-submit-session",
                "device-declined",
                "device-request-expired",
            ])
                expect(reviewCaseForNode(cases, id)?.id).toBe(id);
            expect(reviewCaseForNode(cases, "device-errors")?.pageId).toBe(
                "device-errors",
            );
        }
    });
    it("identifies the shared GitHub handoff in every entry path without requiring a capture", () => {
        for (const [flow, section, id] of [
            ["app", "main", "github-handoff"],
            ["app", "topup", "account-github"],
            ["device", "main", "github-handoff"],
            ["device", "link", "github-handoff"],
            ["account", "main", "dashboard-github"],
            ["admin", "main", "admin-github"],
        ] as const) {
            const page = reviewPageForNode(
                reviewCasesForFlow(flow, section),
                galleryScreensForFlow(flow, section),
                "github-handoff",
            );
            expect(page?.entry.id, `${flow}/${section}`).toBe(id);
            expect(page?.node).toBe(id);
            expect(page?.entry.title).toBe("Continue on GitHub");
        }
    });
    it("uses App Login recovery situations instead of allowance buttons for disconnected or failed SDK returns", () => {
        for (const node of [
            "app-connect",
            "app-connected",
            "app-callback",
            "app-callback-error",
            "app-account-error",
        ]) {
            const page = reviewPageForLocation(
                { flow: "app", section: "topup" },
                { node, flow: "app" },
            );
            expect(page?.entry.id).toBe(
                node === "app-connected"
                    ? "account-app"
                    : node === "app-connect"
                      ? "app-connect"
                      : "app-connected",
            );
            expect(page?.section).toBe(
                node === "app-connected" ? "topup" : "main",
            );
            expect(
                reviewPageForNode(
                    reviewCasesForFlow("app", "main"),
                    galleryScreensForFlow("app", "main"),
                    node,
                )?.node,
            ).toBe(node);
        }
    });
    it("follows consent reached from Top up to the existing funding choices and Map", () => {
        for (const node of [
            "sign-in",
            "error",
            "loading",
            "blocked",
            "consent",
            "app-connection-failed",
        ]) {
            const page = reviewPageForLocation(
                { flow: "app", section: "topup" },
                { node, flow: "app" },
            );
            expect(page?.flow).toBe("app");
            expect(page?.section).toBe("main");
            expect(page?.recipe).toBe(
                reviewCaseForNode(reviewCasesForFlow("app", "main"), node),
            );
            expect(getFlowFocus("app", "main").nodeIds.has(page!.node)).toBe(
                true,
            );
        }
        const consent = reviewPageForLocation(
            { flow: "app", section: "topup" },
            { node: "consent", flow: "app" },
        )!;
        expect(
            reviewCasesForFlow(consent.flow, consent.section)
                .filter(
                    (recipe) =>
                        recipe.pageId === consent.entry.id &&
                        isJourneySituation(recipe),
                )
                .map((recipe) => recipe.id),
        ).toContain("consent-no-pollen");
        expect(
            reviewCasesForFlow(consent.flow, consent.section)
                .filter(
                    (recipe) =>
                        recipe.pageId === consent.entry.id &&
                        isJourneySituation(recipe),
                )
                .map((recipe) => recipe.id),
        ).toContain("consent-paid-required");
    });
    it("finds the standalone wallet and app access from every entry path without duplicating their recipes", () => {
        for (const { flow, section } of reviewFlows) {
            for (const node of ["account-wallet", "account-key"]) {
                const page = reviewPageForLocation(
                    {
                        flow: flow as JourneyEntrance,
                        section: section as JourneySection,
                    },
                    { node },
                )!;
                expect(page).toMatchObject({
                    flow: "app",
                    section: "topup",
                    entry: { id: node },
                });
                expect(page.recipe).toBe(
                    reviewCaseForNode(reviewCasesForFlow("app", "topup"), node),
                );
                expect(
                    getFlowFocus(page.flow, page.section).nodeIds.has(
                        page.node,
                    ),
                ).toBe(true);
            }
        }
    });
    it("keeps Device consent and its original code/link path when returning from the shared wallet", () => {
        for (const section of ["main", "link"] as const) {
            const page = reviewPageForLocation(
                { flow: "app", section: "topup" },
                { node: "consent", flow: "device" },
                { flow: "device", section },
            );
            expect(page).toMatchObject({
                flow: "device",
                section,
                entry: { id: "consent" },
            });
            expect(page?.recipe?.prepare?.device).toBe("pending");
        }
    });
    it("follows Dashboard list, modal, and authentication navigation across every section", () => {
        for (const { id: section } of dashboardSections) {
            for (const node of [
                "github-handoff",
                "login-failed",
                "account-deactivated",
            ]) {
                const page = reviewPageForLocation(
                    { flow: "account", section },
                    { node },
                );
                expect(page).toMatchObject({
                    flow: "account",
                    section: "main",
                });
            }
            for (const target of dashboardSections) {
                const inventory = galleryScreensForFlow("account", target.id);
                for (const screen of inventory.filter(
                    (item) => item.owner === "Pollinations",
                )) {
                    const page = reviewPageForLocation(
                        { flow: "account", section },
                        { node: screen.id, flow: "account" },
                    );
                    expect(page).toMatchObject({
                        flow: "account",
                        section: target.id,
                        entry: { id: screen.id },
                    });
                }
            }
        }
    });
    it("returns to the real Admin pages and never maps an unknown route to the preceding screen", () => {
        for (const node of [
            "identity",
            "dashboard-sign-in",
            "dashboard-connected",
        ]) {
            expect(
                reviewPageForLocation(
                    { flow: "app", section: "topup" },
                    { node, flow: "admin" },
                ),
            ).toMatchObject({
                flow: "admin",
                section: "main",
                entry: { id: node },
            });
        }
        for (const { flow, section } of reviewFlows)
            expect(
                reviewPageForLocation(
                    {
                        flow: flow as JourneyEntrance,
                        section: section as JourneySection,
                    },
                    { node: "unknown" },
                ),
            ).toBeUndefined();
    });
    it("keeps external and unrecognized pages in the current Dashboard section", () => {
        for (const node of [
            "github-handoff",
            "login-failed",
            "account-deactivated",
            "unknown",
        ])
            expect(dashboardSectionForScreen(node)).toBeUndefined();
        expect(dashboardSectionForScreen("enter-connected")).toBe("topup");
        expect(dashboardSectionForScreen("key-edit")).toBe("keys");
        expect(dashboardSectionForScreen("enter-signed-out")).toBe("main");
    });
    it("checks the named list or balance condition in addition to its heading", () => {
        for (const { cases } of reviewFlows)
            for (const recipe of cases) {
                if (recipe.prepare?.dashboard === "empty")
                    expect(
                        recipe.expected.some(
                            (item) =>
                                item.selector === "p" &&
                                item.text?.includes("first"),
                        ),
                        recipe.id,
                    ).toBe(true);
                if (
                    recipe.conditions.pollen &&
                    ["account-wallet", "enter-connected"].includes(
                        recipe.pageId,
                    )
                )
                    expect(
                        recipe.expected.filter((item) =>
                            item.selector.includes(
                                "polli-wallet-balance-value",
                            ),
                        ),
                        recipe.id,
                    ).toHaveLength(2);
            }
    });
    it("does not substitute another flow for an unknown section", () => {
        expect(reviewCasesForFlow("app", "unknown")).toEqual([]);
        expect(reviewCasesForFlow("unknown", "main")).toEqual([]);
    });
    it("shares wallet warning preparation across App and both Device consent paths", () => {
        const app = reviewCasesForFlow("app", "main");
        for (const id of ["no-pollen", "paid-required"]) {
            const consent = app.find((recipe) => recipe.id === `consent-${id}`);
            expect(consent).toBeDefined();
            expect(consent?.conditions.pollen).toBe(
                id === "no-pollen" ? "empty" : "quest",
            );
            expect(
                consent?.expected.some(({ selector }) =>
                    selector.includes(
                        'data-pollinations-action="fund-account"',
                    ),
                ),
            ).toBe(true);
            for (const section of ["main", "link"]) {
                const device = reviewCasesForFlow("device", section).find(
                    (recipe) => recipe.id === consent?.id,
                );
                expect(device?.pageId).toBe("consent");
                expect(device?.family).toBe("consent");
                expect(device?.conditions).toEqual(consent?.conditions);
                expect(device?.steps).toEqual(consent?.steps);
                expect(device?.prepare?.device).toBe("pending");
            }
        }
    });

    it("reviews balance warnings separately from the two grant failures", () => {
        const cases = reviewCasesForFlow("app", "main");
        const page = galleryScreensForFlow("app", "main").find(
            (entry) => entry.id === "consent-errors",
        );
        if (!page) throw new Error("Missing consent errors");
        const failures = cases.filter((recipe) => recipe.pageId === page.id);
        expect(failures.map((recipe) => situationLabel(recipe, page))).toEqual([
            "Key creation failed",
            "Handoff failed",
        ]);
        expect(failures.map((recipe) => recipe.requests?.[0].path)).toEqual([
            "/api/api-keys",
            "/api/oauth/code",
        ]);
        for (const failure of failures) {
            expect(failure.conditions.pollen).toBeUndefined();
            expect(failure.steps).toEqual([
                { selector: "button", text: "Allow access", action: "click" },
            ]);
        }
    });
    it("keeps every case reachable within one card per screen, even when ids overlap", () => {
        for (const { flow, section, cases } of reviewFlows) {
            const screens = galleryScreensForFlow(
                flow as JourneyEntrance,
                section as JourneySection,
            );
            expect(new Set(screens.map((entry) => entry.id)).size).toBe(
                screens.length,
            );
            for (const recipe of cases) {
                const entry = screens.find(
                    (entry) => entry.id === recipe.pageId,
                );
                if (!entry) throw new Error(`Missing screen: ${recipe.pageId}`);
                const selected = reviewCaseForScreen(cases, entry, {
                    [entry.id]: recipe.id,
                });
                expect(selected, `${flow}/${section}/${recipe.id}`).toBe(
                    recipe,
                );
            }
        }
    });

    it("resolves the same complete conditions regardless of the previously reviewed case", () => {
        const cases = reviewFlows.flatMap((flow) => flow.cases);
        for (const recipe of cases) {
            const expected = { ...defaultConditions, ...recipe.conditions };
            const result = reviewConditions(recipe);
            expect(result, recipe.id).toEqual(expected);
            // A consumer changing its own copy must not mutate the next run.
            result.account = "banned";
            result.role = "admin";
            result.allowance = "exhausted";
            result.pollen = "empty";
            expect(reviewConditions(recipe), recipe.id).toEqual(expected);
        }
    });

    it("binds every App Login Map screen to the right executable family", () => {
        const cases = reviewCasesForFlow("app", "main");
        for (const node of appLoginNodes.filter((node) => node.screen)) {
            const entry = appLoginScreens.get(node.id);
            if (!entry) throw new Error(`Missing Map screen: ${node.id}`);
            const matching = cases.filter(
                (recipe) => recipe.family === node.id,
            );
            expect(matching.length, node.id).toBeGreaterThan(0);
            for (const recipe of cases) {
                const resolved = reviewCaseForScreen(
                    cases,
                    entry,
                    { [recipe.pageId]: recipe.id },
                    node.id,
                );
                expect(
                    resolved?.family,
                    `${node.id} while choosing ${recipe.id}`,
                ).toBe(node.id);
            }
        }
    });

    it.each([
        "main",
        "link",
    ] as const)("keeps all device error branches distinct in %s Map", (section) => {
        const cases = reviewCasesForFlow("device", section);
        const map = getDeviceFlow(section).map;
        for (const recipe of cases) {
            const entry = map.screens.get(recipe.family);
            if (!entry)
                throw new Error(`Missing device Map screen: ${recipe.family}`);
            expect(
                reviewCaseForScreen(
                    cases,
                    entry,
                    { [recipe.pageId]: recipe.id },
                    recipe.family,
                ),
            ).toBe(recipe);
        }
    });
    it("uses the same observed page for Journey captions and screen selection", () => {
        const app = reviewCasesForFlow("app", "main");
        expect(reviewCaseForNode(app, "app-callback-error")?.pageId).toBe(
            "app-connected",
        );
        expect(reviewCaseForNode(app, "app-connecting")?.pageId).toBe(
            "consent",
        );
        expect(reviewCaseForNode(app, "app-connection-failed")?.pageId).toBe(
            "consent-errors",
        );
        const admin = reviewCasesForFlow("admin", "main");
        for (const node of [
            "login-failed",
            "staging-invite-only",
            "account-deactivated",
        ])
            expect(reviewCaseForNode(admin, node)?.pageId, node).toBe(
                "admin-auth-error",
            );
        expect(reviewCaseForNode(app, "unknown-page")).toBeUndefined();
    });
});
