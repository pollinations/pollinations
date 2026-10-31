import {
    readModelSelection,
    writeModelSelection,
} from "@frontend/components/keys/model-selection.ts";
import {
    canGrantKeysByLink,
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
    expiryDaysToExpiresIn,
    getAuthorizeInitialPermissions,
    getConsentPermissionChoices,
    getGrantedOAuthScope,
    getPreselectedConsentPermissions,
    MAX_LINK_CONSENT_BUDGET,
    sanitizeAuthorizeAccountPermissions,
} from "@shared/auth/authorize-config.ts";
import { parseAuthorizeRedirectUrl } from "@shared/auth/redirect-uri.ts";
import { MODEL_CATEGORIES } from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";

describe("getConsentPermissionChoices", () => {
    // A website never gets account admin; polli's device login and local MCP
    // clients such as Claude Code still can.
    const requested = new Set(["usage", "keys", "machines"]);
    const withKeys = ["usage", "keys", "machines"];
    const withoutKeys = ["usage", "machines"];

    it.each([
        {
            flow: "device flow",
            device: true,
            redirect: null,
            expected: withKeys,
        },
        {
            flow: "localhost redirect",
            device: false,
            redirect: "http://localhost:3456/callback",
            expected: withKeys,
        },
        {
            flow: "127.0.0.1 redirect",
            device: false,
            redirect: "http://127.0.0.1:53682/callback",
            expected: withKeys,
        },
        {
            flow: "website redirect",
            device: false,
            redirect: "https://example.com/callback",
            expected: withoutKeys,
        },
        {
            flow: "app scheme redirect",
            device: false,
            redirect: "myapp://localhost/callback",
            expected: withoutKeys,
        },
    ])("$flow", ({ device, redirect, expected }) => {
        expect(
            getConsentPermissionChoices(
                requested,
                device,
                redirect ? new URL(redirect) : null,
            ),
        ).toEqual(expected);
    });
});

describe("canGrantKeysByLink", () => {
    // A grant link follows the consent screen's rule, judged by where the
    // key's consent redirected.
    it.each([
        { key: "device login, dashboard or API", origin: undefined, ok: true },
        {
            key: "localhost redirect",
            origin: "http://localhost:3456",
            ok: true,
        },
        {
            key: "127.0.0.1 redirect",
            origin: "http://127.0.0.1:53682",
            ok: true,
        },
        { key: "website redirect", origin: "https://example.com", ok: false },
        // An app scheme such as myapp://callback has the origin "null".
        { key: "app scheme redirect", origin: "null", ok: false },
    ])("$key", ({ origin, ok }) => {
        expect(canGrantKeysByLink(origin)).toBe(ok);
    });
});

describe("getGrantedOAuthScope", () => {
    it.each([
        [[], [], undefined],
        [["generate"], [], "generate"],
        [["generate", "usage", "keys"], ["usage"], "generate usage"],
        [["usage"], [], ""],
        [["unknown"], [], ""],
    ])("echoes granted scopes for %j", (requested, granted, expected) => {
        expect(getGrantedOAuthScope(new Set(requested), granted)).toBe(
            expected,
        );
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

    // A link can ask for key management, sandboxes or sites, but the user must
    // tick them: people tend to click "Allow" without reading.
    it("leaves keys, machines and sites unticked when a link requests them", () => {
        expect(
            getAuthorizeInitialPermissions({
                permissions: ["usage", "keys", "machines", "sites"],
            }).accountPermissions,
        ).toEqual(["usage"]);
        expect(
            getAuthorizeInitialPermissions({ permissions: ["keys"] })
                .accountPermissions,
        ).toBeNull();
        expect(getPreselectedConsentPermissions(["machines"])).toBeNull();
    });

    it("caps the budget a link can pre-fill", () => {
        expect(
            getAuthorizeInitialPermissions({ budget: 100_000 }).pollenBudget,
        ).toBe(MAX_LINK_CONSENT_BUDGET);
        expect(getAuthorizeInitialPermissions({ budget: 2 }).pollenBudget).toBe(
            2,
        );
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

describe("model category selection", () => {
    it("keeps model IDs beside categories so a save never widens them", () => {
        const selection = readModelSelection([
            "flux-schnell",
            "audio",
            "community/alice/private",
        ]);
        expect([...selection.categories]).toEqual(["audio"]);
        expect(selection.models).toEqual([
            "flux-schnell",
            "community/alice/private",
        ]);
        selection.categories.add("text");
        expect(writeModelSelection(selection)).toEqual([
            "text",
            "audio",
            "flux-schnell",
            "community/alice/private",
        ]);
    });

    it("stores every category as all models and keeps none distinct", () => {
        const all = readModelSelection(null);
        expect([...all.categories].sort()).toEqual(
            [...MODEL_CATEGORIES].sort(),
        );
        expect(writeModelSelection(all)).toBeNull();
        expect(
            writeModelSelection({ categories: new Set(), models: [] }),
        ).toEqual([]);
    });
});

describe("parseAuthorizeRedirectUrl", () => {
    it.each([
        "https://app.example/callback?x=1",
        "http://localhost:5173/",
        "http://127.0.0.1:8080/cb",
        "http://[::1]:3000/cb",
        "myapp://callback",
    ])("accepts %s", (url) => {
        expect(parseAuthorizeRedirectUrl(url)?.href).toBe(new URL(url).href);
    });

    it.each([
        " JavaScript:void(0)",
        "java\tscript://app.example/%0avoid(0)",
        "data:text/html,hello",
        "file:///C:/app/index.html",
        "not a url",
    ])("rejects %j", (url) => {
        expect(parseAuthorizeRedirectUrl(url)).toBeNull();
    });
});
