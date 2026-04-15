import { describe, expect, it } from "vitest";
import { normalizeAllowedModelSelection } from "@/client/components/api-keys/model-selection.ts";
import {
    DEFAULT_CONSENT_ACCOUNT_PERMISSIONS,
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    getAuthorizeInitialPermissions,
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
});

describe("getAuthorizeInitialPermissions", () => {
    it("uses the consent defaults when url params are absent", () => {
        expect(getAuthorizeInitialPermissions({})).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: [...DEFAULT_CONSENT_ACCOUNT_PERMISSIONS],
        });
    });

    it("preserves explicit url-provided permission values", () => {
        expect(
            getAuthorizeInitialPermissions({
                models: ["flux"],
                budget: 2,
                expiry: 3,
                permissions: ["usage"],
            }),
        ).toEqual({
            allowedModels: ["flux"],
            pollenBudget: 2,
            expiryDays: 3,
            accountPermissions: ["usage"],
        });
    });
});
