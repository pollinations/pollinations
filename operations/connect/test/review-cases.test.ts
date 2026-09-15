import { getAuthorizeRequestError } from "@shared/auth/authorize-config.ts";
import { loginErrors } from "@shared/auth/login-errors.ts";
import { describe, expect, it } from "vitest";
import { appLoginNodes } from "../pollen-connect-app-login";
import { galleryScreensForFlow } from "../pollen-connect-gallery-data";
import { appLoginReviewCases } from "../review-cases";
import { screenRoute } from "../screen-route";

const origin = "http://localhost:4180";
const state = {
    connection: {
        clientId: "pk_public_test_app",
        keyId: null,
        allowance: null,
        enabled: false,
    },
    admin: { clientId: "pk_public_test_admin", registered: false },
    device: null,
};

describe("App Login visual review cases", () => {
    it("keeps every selectable case serializable and bound to the existing map and page inventory", () => {
        const pages = galleryScreensForFlow("app", "main");
        expect(JSON.parse(JSON.stringify(appLoginReviewCases))).toEqual(
            appLoginReviewCases,
        );
        expect(new Set(appLoginReviewCases.map(({ id }) => id)).size).toBe(
            appLoginReviewCases.length,
        );
        for (const review of appLoginReviewCases) {
            expect(pages.some(({ id }) => id === review.pageId)).toBe(true);
            expect(appLoginNodes.some(({ id }) => id === review.family)).toBe(
                true,
            );
            expect(review.expected.length).toBeGreaterThan(0);
        }
    });

    it.each(
        appLoginReviewCases,
    )("resolves $id to a supported real route", (review) => {
        const route = screenRoute(
            new URLSearchParams(review.query),
            state,
            origin,
        );
        if (review.provider) {
            expect(review.provider).toBe("GitHub");
            expect(route).toBeUndefined();
            expect(review.steps).toBeUndefined();
            return;
        }
        expect(route).toBeDefined();
        const target = new URL(route ?? "", origin);
        expect(["/connect-example.html", "/authorize", "/error"]).toContain(
            target.pathname,
        );
        expect(
            Object.keys(review.query).every((key) =>
                ["screen", "request_error"].includes(key),
            ),
        ).toBe(true);
        if (review.action) {
            expect(review.action.type).toBe("sign-in");
            expect(review.conditions.account).toBe("signed-out");
            expect(target.pathname).toBe("/authorize");
            expect(target.searchParams.has("sign_in_error")).toBe(false);
        }
    });

    it("takes all shared login error titles and messages from production definitions", () => {
        for (const error of Object.values(loginErrors)) {
            const review = appLoginReviewCases.find(
                ({ id }) => id === error.id,
            );
            expect(review?.query).toEqual({
                screen:
                    error.id === loginErrors.default.id
                        ? "oauth-signed-out"
                        : error.id,
            });
            expect(review?.expected).toContainEqual({
                selector: "#sign-in-title",
                text: error.title,
            });
            expect(review?.expected).toContainEqual({
                selector: '[role="alert"]',
                text: error.message,
            });
        }
    });

    it("separates provider-return failure from failure to start sign-in", () => {
        expect(appLoginReviewCases).toHaveLength(38);
        expect(
            appLoginReviewCases.find(({ family }) => family === "login-failed")
                ?.action,
        ).toEqual({ type: "sign-in", outcome: "provider-error" });
        expect(
            appLoginReviewCases.find(({ family }) => family === "error")
                ?.action,
        ).toEqual({ type: "sign-in", outcome: "error" });
    });

    it("uses production front-door validation copy for every malformed input case", () => {
        const invalid = appLoginReviewCases.filter(
            ({ query }) =>
                query.request_error &&
                !["app", "redirect", "lookup"].includes(query.request_error),
        );
        expect(invalid).toHaveLength(8);
        for (const review of invalid) {
            const target = screenRoute(
                new URLSearchParams(review.query),
                state,
                origin,
            );
            const params = new URL(target ?? "", origin).searchParams;
            const read = (key: string) => params.get(key) ?? undefined;
            const error = getAuthorizeRequestError({
                redirectUrl: read("redirect_uri"),
                appKey: read("client_id"),
                responseType: read("response_type"),
                codeChallenge: read("code_challenge"),
                codeChallengeMethod: read("code_challenge_method"),
            });
            expect(error).not.toBeNull();
            expect(review.expected).toContainEqual({
                selector: '[role="alert"]',
                text: error,
            });
        }
    });

    it("covers every App Login state without a default-page substitute", () => {
        expect(
            appLoginReviewCases.some(
                ({ query, requests }) =>
                    query.request_error === "lookup" &&
                    requests?.[0].path === "/api/app-lookup",
            ),
        ).toBe(true);
        for (const page of galleryScreensForFlow("app", "main"))
            for (const variant of page.variants ?? [{ label: page.title }])
                expect(
                    appLoginReviewCases.some(
                        (recipe) =>
                            recipe.pageId === page.id &&
                            recipe.variant === variant.label,
                    ),
                    `${page.id}/${variant.label}`,
                ).toBe(true);
    });
});
