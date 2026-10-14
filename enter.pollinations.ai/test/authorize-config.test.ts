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

describe("permission picker selections", () => {
    it("keeps a finite consent grant finite when every offered model is reselected", () => {
        const offered = ["a", "b"];
        const narrowed = toggleConsentModel(null, offered, "a");
        expect(narrowed).toEqual(["b"]);
        expect(new Set(toggleConsentModel(narrowed, offered, "a"))).toEqual(
            new Set(offered),
        );
        expect(toggleConsentModel(narrowed, offered, "unrequested")).toEqual([
            "b",
        ]);
    });
    it("changes only visible models and preserves selections outside the loaded catalog", () => {
        expect(
            setConsentModelGroup(
                ["a", "b", "private"],
                ["a", "b", "c"],
                ["a"],
                false,
            ),
        ).toEqual(["b", "private"]);
        expect(
            setConsentModelGroup(["b"], ["a", "b"], ["a", "unrequested"], true),
        ).toEqual(["b", "a"]);
    });
    it("preserves the difference between no models and all models", () => {
        expect(normalizeAllowedModelSelection([], ["a", "b"])).toEqual([]);
        expect(normalizeAllowedModelSelection([], [])).toEqual([]);
        expect(
            setConsentModelGroup(null, ["a", "b"], ["a", "b"], false),
        ).toEqual([]);
    });
});
