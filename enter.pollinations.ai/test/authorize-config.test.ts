import {
    normalizeAllowedModelSelection,
    setConsentModelGroup,
    toggleConsentModel,
} from "@frontend/components/keys/model-selection.ts";
import {
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    expiryDaysToExpiresIn,
    getAuthorizeInitialPermissions,
    getAuthorizePollenBudget,
    getAuthorizeRequestError,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import { describe, expect, it } from "vitest";

describe("normalizeAllowedModelSelection", () => {
    it("collapses fully selected model lists back to null", () => {
        const allModelIds = ["a", "b", "c"];

        expect(
            normalizeAllowedModelSelection(["a", "b", "c"], allModelIds),
        ).toBeNull();
    });

    it("keeps partial selections as explicit arrays", () => {
        const allModelIds = ["a", "b", "c"];

        expect(normalizeAllowedModelSelection(["a", "b"], allModelIds)).toEqual(
            ["a", "b"],
        );
    });

    it("does not collapse to null when selections include stale model ids", () => {
        const allModelIds = ["a", "b", "c"];

        expect(
            normalizeAllowedModelSelection(["a", "b", "x"], allModelIds),
        ).toEqual(["a", "b", "x"]);
    });
});

describe("getAuthorizeInitialPermissions", () => {
    it("uses the consent defaults when url params are absent", () => {
        expect(getAuthorizeInitialPermissions({})).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: null,
        });
    });

    it("keeps optional permissions from the url in state", () => {
        expect(
            getAuthorizeInitialPermissions({
                models: ["black-forest-labs/flux.1-schnell"],
                budget: 2,
                expiry: 3,
                permissions: ["usage", "profile"],
            }),
        ).toEqual({
            allowedModels: ["black-forest-labs/flux.1-schnell"],
            pollenBudget: 2,
            expiryDays: 3,
            accountPermissions: ["usage", "profile"],
        });
    });

    it("drops legacy balance scope after the merge with usage", () => {
        expect(
            getAuthorizeInitialPermissions({
                permissions: ["balance", "usage"],
            }),
        ).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: ["usage"],
        });
    });

    it("preserves an explicit unrestricted model selection", () => {
        expect(
            getAuthorizeInitialPermissions({
                models: null,
            }),
        ).toEqual({
            allowedModels: null,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: null,
        });
    });

    it("preserves a zero budget instead of falling back to the default", () => {
        expect(
            getAuthorizeInitialPermissions({
                budget: 0,
            }),
        ).toEqual({
            allowedModels: undefined,
            pollenBudget: 0,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: null,
        });
    });
});

describe("expiryDaysToExpiresIn", () => {
    it("converts the consent default to seconds", () => {
        expect(expiryDaysToExpiresIn(DEFAULT_CONSENT_EXPIRY_DAYS)).toBe(
            DEFAULT_CONSENT_EXPIRY_DAYS * 24 * 60 * 60,
        );
        expect(expiryDaysToExpiresIn(0.5)).toBe(43200);
    });

    it("means no expiry only when the field is empty", () => {
        expect(expiryDaysToExpiresIn(null)).toBeUndefined();
        expect(expiryDaysToExpiresIn(undefined)).toBeUndefined();
    });

    it("keeps every fractional day the field accepts", () => {
        expect(expiryDaysToExpiresIn(0.25)).toBe(21600);
        expect(expiryDaysToExpiresIn(0.1)).toBe(8640);
        expect(expiryDaysToExpiresIn(1.5)).toBe(129600);
        expect(expiryDaysToExpiresIn(30.5)).toBe(2635200);
    });

    // The bug: a fraction that doesn't land on a whole second failed the
    // server's .int() check, so the request 400'd instead of creating a key.
    it("rounds a mid-second fraction to whole seconds", () => {
        expect(expiryDaysToExpiresIn(0.123456)).toBe(10667);
        expect(expiryDaysToExpiresIn(0.0001)).toBe(9);
    });

    // Left invalid on purpose. The server already rejects these, and turning
    // them into "no expiry" here would hand back a key that never expires.
    it("leaves a non-positive expiry for the server to reject", () => {
        expect(expiryDaysToExpiresIn(0)).toBe(0);
        expect(expiryDaysToExpiresIn(-7)).toBe(-604800);
    });
});

describe("sanitizeAuthorizeAccountPermissions", () => {
    it("allows only the consent permission set", () => {
        expect(
            sanitizeAuthorizeAccountPermissions([
                "offline_access",
                "usage",
                "profile",
                "keys",
                "usage",
                "admin",
            ]),
        ).toEqual(["usage", "profile", "keys"]);
    });

    it("returns null when no safe permissions remain", () => {
        expect(
            sanitizeAuthorizeAccountPermissions(["admin", "offline_access"]),
        ).toBeNull();
    });
});

describe("toggleConsentModel", () => {
    it("keeps a finite request finite when its last model is reselected", () => {
        const requested = ["a", "b"];
        const reduced = toggleConsentModel(requested, requested, "b");
        expect(reduced).toEqual(["a"]);
        expect(toggleConsentModel(reduced, requested, "b")).toEqual(requested);
    });

    it("turns unrestricted access into an explicit list when a model is removed", () => {
        expect(toggleConsentModel(null, ["a", "b"], "a")).toEqual(["b"]);
    });

    it("keeps an empty selection instead of treating it as unrestricted", () => {
        expect(toggleConsentModel(["a"], ["a"], "a")).toEqual([]);
    });

    it("does not add models outside the requested set", () => {
        expect(toggleConsentModel(["a"], ["a", "b"], "c")).toEqual(["a"]);
    });
});

describe("generation spending allowance", () => {
    it("grants zero budget when generation is disabled, even for an unlimited draft", () => {
        expect(getAuthorizePollenBudget([], 5)).toBe(0);
        expect(getAuthorizePollenBudget([], null)).toBe(0);
    });

    it("preserves the chosen budget when generation is enabled", () => {
        expect(getAuthorizePollenBudget(null, 5)).toBe(5);
        expect(getAuthorizePollenBudget(["a"], 2)).toBe(2);
        expect(getAuthorizePollenBudget(["a"], null)).toBeNull();
    });
});

describe("filtered model selection", () => {
    it("clears visible results while preserving hidden selections", () => {
        expect(
            setConsentModelGroup(
                null,
                ["text", "image", "community"],
                ["community"],
                false,
            ),
        ).toEqual(["text", "image"]);
        expect(
            setConsentModelGroup(
                ["text", "community"],
                ["text", "image", "community"],
                ["text"],
                false,
            ),
        ).toEqual(["community"]);
    });
    it("selects visible results without adding unrequested or hidden models", () => {
        expect(
            setConsentModelGroup(
                [],
                ["text", "image"],
                ["image", "unrequested"],
                true,
            ),
        ).toEqual(["image"]);
        expect(
            setConsentModelGroup(["text"], ["text", "image"], ["image"], true),
        ).toEqual(["text", "image"]);
    });
});

describe("getAuthorizeRequestError", () => {
    const valid = {
        redirectUrl: "https://app.example/callback",
        appKey: "app-client",
        responseType: "code",
        codeChallenge: "a".repeat(43),
        codeChallengeMethod: "S256",
    };
    it("accepts complete OAuth and legacy BYOP requests", () => {
        expect(getAuthorizeRequestError(valid)).toBeNull();
        expect(
            getAuthorizeRequestError({ redirectUrl: valid.redirectUrl }),
        ).toBeNull();
    });
    it.each([
        [{ redirectUrl: undefined }, "No redirect URL"],
        [{ redirectUrl: "not-a-url" }, "Invalid redirect URL"],
        [{ responseType: "token" }, "Unsupported response_type"],
        [{ appKey: undefined }, "client_id is required"],
        [{ codeChallenge: undefined }, "PKCE code_challenge is required"],
        [{ codeChallengeMethod: "plain" }, "code_challenge_method=S256"],
        [{ codeChallenge: "short" }, "43-character base64url"],
        [{ codeChallenge: "+".repeat(43) }, "43-character base64url"],
    ])("blocks malformed requests independently of app identity: %j", (patch, message) => {
        expect(getAuthorizeRequestError({ ...valid, ...patch })).toContain(
            message,
        );
    });
});

describe("authorization redirect schemes", () => {
    it.each([
        "javascript:void(0)",
        "data:text/html,example",
        "http://app.example/callback",
    ])("rejects %s before either protocol can redirect", (redirectUrl) => {
        for (const responseType of [undefined, "code"]) {
            expect(
                getAuthorizeRequestError({ redirectUrl, responseType }),
            ).toBe(
                "Redirect URL must use HTTPS (HTTP is allowed for localhost).",
            );
        }
    });
    it.each([
        "https://app.example/callback",
        "http://localhost:1234/callback",
        "http://127.0.0.1:1234/callback",
    ])("preserves supported legacy callbacks: %s", (redirectUrl) => {
        expect(getAuthorizeRequestError({ redirectUrl })).toBeNull();
    });
});
