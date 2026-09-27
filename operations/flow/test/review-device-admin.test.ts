import { describe, expect, it } from "vitest";
import { adminNodes } from "../flow-admin";
import { getDeviceFlow } from "../flow-device";
import { galleryScreensForFlow } from "../flow-gallery-data";
import { deviceCodeExpectations, loginSituations } from "../review-auth";
import {
    adminReviewCases,
    deviceReviewCasesForSection,
} from "../review-device-admin";
import { screenRoute } from "../screen-route";

const origin = "http://localhost:4180";
const state = {
    connection: {
        clientId: "pk_public_test_app",
        keyId: null,
        allowance: null,
        enabled: false,
    },
    admin: { clientId: "pk_public_test_admin", registered: true },
    device: {
        userCode: "LOCAL123",
        clientId: "pk_public_test_app",
        verificationUri: `${origin}/device`,
        verificationUriComplete: `${origin}/device?user_code=LOCAL123`,
        status: "pending" as const,
    },
};

describe("real Device and Admin review recipes", () => {
    it.each([
        "main",
        "link",
    ] as const)("binds every device recipe to the shared %s Screens and Map inventory", (section) => {
        const recipes = deviceReviewCasesForSection(section);
        const flow = getDeviceFlow(section);
        const pages = galleryScreensForFlow("device", section);
        expect(new Set(recipes.map(({ id }) => id)).size).toBe(recipes.length);
        for (const recipe of recipes) {
            expect(pages.some(({ id }) => id === recipe.pageId)).toBe(true);
            expect(flow.map.nodes.some(({ id }) => id === recipe.family)).toBe(
                true,
            );
            expect(recipe.expected.length).toBeGreaterThan(0);
            const route = screenRoute(
                new URLSearchParams(recipe.query),
                state,
                origin,
            );
            expect(route).toBeDefined();
            expect(["/device", "/authorize", "/error"]).toContain(
                new URL(route ?? "", origin).pathname,
            );
        }
        const accounted = new Set(recipes.map(({ id }) => id));
        for (const entry of flow.screens.values())
            if (!entry.illustration)
                expect(accounted.has(entry.id), entry.id).toBe(true);
    });

    it("reuses the same device consent and recovery after both entry methods", () => {
        const code = deviceReviewCasesForSection("main");
        const linked = deviceReviewCasesForSection("link");
        expect(code.find(({ id }) => id === "sign-in")?.query.user_code).toBe(
            "",
        );
        expect(linked.find(({ id }) => id === "sign-in")?.query.user_code).toBe(
            "current",
        );
        for (const id of [
            "consent",
            "device-code-expired",
            "device-request-used",
            "device-declined",
        ])
            expect(code.find((recipe) => recipe.id === id)).toEqual(
                linked.find((recipe) => recipe.id === id),
            );
        for (const kind of ["invalid", "expired", "used"] as const) {
            const recipe = code.find(({ id }) => id === `device-code-${kind}`);
            expect(recipe?.expected).toContainEqual({
                selector: "#device-code-form",
                text: deviceCodeExpectations[kind],
            });
            expect(recipe?.conditions.account).toBe("signed-in");
            expect(recipe?.prepare?.device).toBe(
                kind === "invalid" ? undefined : kind,
            );
        }
        expect(code.find(({ id }) => id === "device-declined")?.action).toEqual(
            { type: "device-deny" },
        );
    });

    it("binds admin recipes to real pages and retains independent expected error messages", () => {
        const pages = galleryScreensForFlow("admin", "main");
        for (const recipe of adminReviewCases) {
            expect(pages.some(({ id }) => id === recipe.pageId)).toBe(true);
            expect(adminNodes.some(({ id }) => id === recipe.family)).toBe(
                true,
            );
            const route = screenRoute(
                new URLSearchParams(recipe.query),
                state,
                origin,
            );
            expect(route).toBeDefined();
            expect(["/", "/auth/login", "/error"]).toContain(
                new URL(route ?? "", origin).pathname,
            );
        }
        for (const error of Object.values(loginSituations))
            expect(
                adminReviewCases.find(({ id }) => id === `admin-${error.id}`)
                    ?.expected,
            ).toContainEqual({
                selector: '[role="alert"]',
                text: error.message,
            });
        expect(
            adminReviewCases.find(({ id }) => id === "admin-login-failed")
                ?.action,
        ).toEqual({ type: "sign-in", outcome: "provider-error" });
    });
});
