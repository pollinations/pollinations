import { loginErrors } from "@shared/auth/login-errors.ts";
import { describe, expect, it } from "vitest";
import { deviceCodeMessages } from "../../../enter.pollinations.ai/frontend/src/lib/device-request.ts";
import { adminNodes } from "../pollen-connect-admin";
import { getDeviceFlow } from "../pollen-connect-device";
import { galleryScreensForFlow } from "../pollen-connect-gallery-data";
import {
    adminReviewCases,
    deviceReviewCasesForSection,
    unsupportedDeviceReviewCases,
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
        const accounted = new Set([
            ...recipes.map(({ id }) => id),
            ...unsupportedDeviceReviewCases(section).map(({ id }) => id),
        ]);
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
                selector: "#device-code-error",
                text: deviceCodeMessages[kind],
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

    it("binds admin recipes to real pages and retains production error definitions", () => {
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
            expect(["/connect-admin.html", "/app/sign-in", "/error"]).toContain(
                new URL(route ?? "", origin).pathname,
            );
        }
        for (const error of Object.values(loginErrors))
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
