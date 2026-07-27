import { normalizeAllowedModelSelection } from "@frontend/components/keys/model-selection.ts";
import {
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    expiryDaysToExpiresIn,
    getAuthorizeInitialPermissions,
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
                models: ["flux"],
                budget: 2,
                expiry: 3,
                permissions: ["usage", "profile"],
            }),
        ).toEqual({
            allowedModels: ["flux"],
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

    it("means no expiry when the field is empty", () => {
        expect(expiryDaysToExpiresIn(null)).toBeUndefined();
        expect(expiryDaysToExpiresIn(undefined)).toBeUndefined();
    });

    it("means no expiry for values that can't be positive whole seconds", () => {
        expect(expiryDaysToExpiresIn(0)).toBeUndefined();
        expect(expiryDaysToExpiresIn(-7)).toBeUndefined();
        expect(expiryDaysToExpiresIn(Number.NaN)).toBeUndefined();
    });

    it("rounds fractional days to whole seconds", () => {
        expect(expiryDaysToExpiresIn(0.00001)).toBe(1);
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
