import { describe, expect, it } from "vitest";
import { normalizeAllowedModelSelection } from "@/client/components/api-keys/model-selection.ts";
import {
    AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS,
    BASELINE_CONSENT_PERMISSIONS,
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    getAuthorizeInitialPermissions,
    OPTIONAL_CONSENT_PERMISSIONS,
    sanitizeAuthorizeAccountPermissions,
    withBaselinePermissions,
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
                permissions: ["usage"],
            }),
        ).toEqual({
            allowedModels: ["flux"],
            pollenBudget: 2,
            expiryDays: 3,
            accountPermissions: ["usage"],
        });
    });

    it("strips baseline permissions from url-provided values (they are implicit)", () => {
        expect(
            getAuthorizeInitialPermissions({
                permissions: ["profile", "balance", "usage"],
            }),
        ).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: ["usage"],
        });
    });

    it("returns null account permissions when only baseline scopes are passed", () => {
        expect(
            getAuthorizeInitialPermissions({
                permissions: ["profile", "balance"],
            }),
        ).toEqual({
            allowedModels: undefined,
            pollenBudget: DEFAULT_CONSENT_BUDGET,
            expiryDays: DEFAULT_CONSENT_EXPIRY_DAYS,
            accountPermissions: null,
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
    it("allows only the authorize-safe permission set", () => {
        expect(AUTHORIZE_ALLOWED_ACCOUNT_PERMISSIONS).toEqual([
            "profile",
            "balance",
            "usage",
        ]);
        expect(
            sanitizeAuthorizeAccountPermissions([
                "keys",
                "usage",
                "profile",
                "usage",
                "offline_access",
            ]),
        ).toEqual(["usage", "profile"]);
    });

    it("returns null when no safe permissions remain", () => {
        expect(
            sanitizeAuthorizeAccountPermissions(["keys", "offline_access"]),
        ).toBeNull();
    });
});

describe("withBaselinePermissions", () => {
    it("always includes profile and balance", () => {
        expect(withBaselinePermissions(null)).toEqual([
            ...BASELINE_CONSENT_PERMISSIONS,
        ]);
    });

    it("merges optional permissions without duplicating baseline", () => {
        expect(withBaselinePermissions(["usage"])).toEqual([
            ...BASELINE_CONSENT_PERMISSIONS,
            "usage",
        ]);
    });

    it("is idempotent when optional already contains baseline", () => {
        expect(
            withBaselinePermissions(["profile", "balance", "usage"]),
        ).toEqual([...BASELINE_CONSENT_PERMISSIONS, "usage"]);
    });
});

describe("consent permission sets", () => {
    it("baseline and optional sets do not overlap", () => {
        for (const p of BASELINE_CONSENT_PERMISSIONS) {
            expect(OPTIONAL_CONSENT_PERMISSIONS).not.toContain(p);
        }
    });
});
