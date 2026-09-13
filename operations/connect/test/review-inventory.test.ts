import { describe, expect, it } from "vitest";
import { defaultConditions, reviewConditions } from "../conditions-data";
import { appLoginNodes, appLoginScreens } from "../pollen-connect-app-login";
import { dashboardSections } from "../pollen-connect-dashboard";
import { getDeviceFlow } from "../pollen-connect-device";
import { getFlowFocus } from "../pollen-connect-diagram";
import { galleryScreensForFlow } from "../pollen-connect-gallery-data";
import type {
    JourneyEntrance,
    JourneySection,
} from "../pollen-connect-journey-state";
import { unsupportedAppLoginReviewCases } from "../review-cases";
import {
    unsupportedAppTopupReviewCases,
    unsupportedDashboardReviewCasesForSection,
} from "../review-dashboard";
import {
    unsupportedAdminReviewCases,
    unsupportedDeviceReviewCases,
} from "../review-device-admin";
import {
    reviewCaseForNode,
    reviewCaseForScreen,
    reviewCasesForFlow,
    reviewFlows,
} from "../review-inventory";
import { screenRoute } from "../screen-route";

describe("shared review inventory", () => {
    it("has an executable case for every declared review state", () => {
        const missing = [
            ...unsupportedAppLoginReviewCases,
            ...unsupportedAppTopupReviewCases,
            ...unsupportedDeviceReviewCases("main"),
            ...unsupportedDeviceReviewCases("link"),
            ...unsupportedAdminReviewCases,
            ...dashboardSections.flatMap(({ id }) =>
                unsupportedDashboardReviewCasesForSection(id),
            ),
        ];
        expect(missing.map(({ id, title }) => ({ id, title }))).toEqual([]);
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
