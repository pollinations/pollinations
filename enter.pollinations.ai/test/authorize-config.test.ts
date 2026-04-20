import { describe, expect, it } from "vitest";
import { normalizeAllowedModelSelection } from "@/client/components/api-keys/model-selection.ts";
import {
    CONSENT_PERMISSIONS,
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    getAuthorizeInitialPermissions,
    sanitizeAuthorizeAccountPermissions,
} from "@/client/lib/authorize-config.ts";

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

    it("keeps balance as an optional permission from the url", () => {
        expect(
            getAuthorizeInitialPermissions({
                permissions: ["balance", "usage"],
            }),
        ).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: ["balance", "usage"],
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

describe("sanitizeAuthorizeAccountPermissions", () => {
    it("allows only the consent permission set", () => {
        expect(CONSENT_PERMISSIONS).toEqual([
            "profile",
            "balance",
            "usage",
            "keys",
        ]);
        expect(
            sanitizeAuthorizeAccountPermissions([
                "offline_access",
                "usage",
                "profile",
                "usage",
                "admin",
            ]),
        ).toEqual(["usage", "profile"]);
    });

    it("returns null when no safe permissions remain", () => {
        expect(
            sanitizeAuthorizeAccountPermissions(["admin", "offline_access"]),
        ).toBeNull();
    });
});
