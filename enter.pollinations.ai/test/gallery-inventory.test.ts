import { getLoginError, loginErrors } from "@shared/auth/login-errors.ts";
import { describe, expect, it, vi } from "vitest";
import { accountActionScreens } from "../frontend/pollen-connect-account-actions";
import {
    adminScreens,
    adminSelectionForPreview,
} from "../frontend/pollen-connect-admin";
import {
    appLoginAutomaticDestination,
    appLoginEdges,
    appLoginPreviewScreen,
    appLoginScreens,
    appLoginVariant,
} from "../frontend/pollen-connect-app-login";
import {
    authorizeFailures,
    canvasGroups,
    canvasScreenUrl,
} from "../frontend/pollen-connect-canvas-data";
import {
    dashboardScreens,
    dashboardSections,
    getDashboardFlow,
} from "../frontend/pollen-connect-dashboard";
import { getDeviceFlow } from "../frontend/pollen-connect-device";
import { flowNodes, getFlowFocus } from "../frontend/pollen-connect-diagram";
import {
    galleryCardsForFlow,
    galleryFlowScreens,
    galleryPagesForFlow,
    galleryScreensForFlow,
} from "../frontend/pollen-connect-gallery-data";
import {
    defaultJourneySettings,
    entrances,
    journeyAdvance,
    journeyOptions,
    startJourney,
    startSelectedJourney,
} from "../frontend/pollen-connect-journey-state";
import { oauthSignInCallback } from "../frontend/src/lib/oauth-sign-in";
import {
    clearSignInContext,
    getSignInContext,
    rememberSignIn,
} from "../frontend/src/lib/sign-in-context";

const { galleryScreens: deviceGalleryScreens, screens: deviceScreens } =
    getDeviceFlow();

describe("Complete managed screen inventory", () => {
    const sources = [
        ...canvasGroups.flatMap((group) => group.screens),
        ...accountActionScreens,
    ];
    const allGallery = [
        ...entrances.flatMap(({ id }) => galleryScreensForFlow(id)),
        ...galleryScreensForFlow("app", "topup"),
    ];
    const represented = new Set(
        allGallery.map((entry) => entry.id.replace(/-errors$/, "")),
    );

    it("includes every Pollinations-maintained screen, including shared screens hosted in apps", () => {
        expect(
            sources
                .filter(
                    (entry) =>
                        (entry.owner === "Pollinations" || entry.maintained) &&
                        !represented.has(entry.id),
                )
                .map((entry) => entry.id),
        ).toEqual([]);
        expect(represented.has("dashboard-sign-in")).toBe(true);
        expect(represented.has("account-wallet")).toBe(true);
    });

    it("covers every managed screen referenced by the journey", () => {
        const managedIds = new Set(
            sources
                .filter(
                    (entry) =>
                        entry.owner === "Pollinations" || entry.maintained,
                )
                .map((entry) => entry.id),
        );
        expect(
            flowNodes
                .filter(
                    (node) =>
                        node.screen &&
                        managedIds.has(node.screen) &&
                        !represented.has(node.screen),
                )
                .map((node) => node.id),
        ).toEqual([]);
    });

    it("includes only managed screens and the explicit provider handoffs in the gallery", () => {
        const managedIds = new Set(
            sources
                .filter(
                    (entry) =>
                        entry.owner === "Pollinations" || entry.maintained,
                )
                .map((entry) => entry.id),
        );
        for (const entry of allGallery)
            expect(
                [
                    "github-handoff",
                    "account-github",
                    "account-payment",
                    "dashboard-github",
                    "admin-github",
                    "account-checkout",
                    "account-billing",
                ].includes(entry.id) ||
                    deviceGalleryScreens.includes(entry) ||
                    managedIds.has(entry.id.replace(/-errors$/, "")),
            ).toBe(true);
        for (const { id } of entrances) {
            const entries = galleryScreensForFlow(id);
            expect(new Set(entries.map((entry) => entry.id)).size).toBe(
                entries.length,
            );
            expect(new Set(galleryFlowScreens[id]).size).toBe(
                galleryFlowScreens[id].length,
            );
        }
    });

    it("shows device sign-in and consent in Devices using the device components", () => {
        const device = galleryScreensForFlow("device");
        expect(
            device.find((entry) => entry.id === "sign-in")?.variants?.[0].label,
        ).toBe("Ready");
        expect(device.find((entry) => entry.id === "sign-in")?.screen).toBe(
            "device-signed-out",
        );
        expect(device.find((entry) => entry.id === "consent")?.screen).toBe(
            "device-consent",
        );
        expect(
            device
                .find((entry) => entry.id === "device-code")
                ?.variants?.some(
                    (variant) => variant.params?.verify === "waiting",
                ),
        ).toBe(true);
    });

    it("includes admin denial and each retry condition at the same flow step", () => {
        const errors = galleryScreensForFlow("admin").find(
            (entry) => entry.id === "dashboard-sign-in",
        );
        expect(
            errors?.variants
                ?.flatMap((variant) =>
                    variant.params?.auth_error
                        ? [variant.params.auth_error]
                        : [],
                )
                .sort(),
        ).toEqual(["admin_required", "invalid_state", "unavailable"]);
    });

    it("exposes account loading and payment waiting alongside their errors", () => {
        const account = galleryScreensForFlow("account");
        expect(
            account
                .find((entry) => entry.id === "enter-connected")
                ?.variants?.some(
                    (variant) => variant.params?.account_case === "loading",
                ),
        ).toBe(true);
        expect(
            account
                .find((entry) => entry.id === "enter-connected")
                ?.variants?.some(
                    (variant) => variant.params?.account_case === "load-error",
                ),
        ).toBe(true);
        expect(
            galleryScreensForFlow("app", "topup")
                .find((entry) => entry.id === "account-wallet")
                ?.variants?.some(
                    (variant) =>
                        variant.params?.account_case === "payment-error",
                ),
        ).toBe(true);
    });
});

it("starts Admin at its dashboard entry and keeps app sign-in errors on the real route", () => {
    expect(entrances.find((entry) => entry.id === "admin")?.node).toBe(
        "dashboard-sign-in",
    );
    const error = galleryScreensForFlow("app").find(
        (entry) => entry.id === "sign-in-errors",
    );
    expect(error?.screen).toBe("oauth-signed-out");
    expect(error?.variants?.[0].params).toEqual({
        action: "sign-in",
        result: "error",
    });
});

it("shows every Enter error route state separately in every login flow and map", () => {
    for (const { id } of entrances) {
        const gallery = galleryScreensForFlow(id);
        const map = getFlowFocus(id);
        for (const error of Object.values(loginErrors)) {
            if (id === "account" || id === "admin") {
                const family =
                    id === "admin"
                        ? "admin-auth-error"
                        : "dashboard-auth-error";
                expect(
                    gallery.find((entry) => entry.id === family)?.variants,
                ).toContainEqual(
                    expect.objectContaining({
                        screen: error.id,
                        params: expect.objectContaining({
                            login_error: error.code,
                        }),
                    }),
                );
                expect(map.nodeIds.has(family)).toBe(true);
                expect(map.edges).toContainEqual(
                    expect.objectContaining({
                        from:
                            id === "admin"
                                ? "admin-github"
                                : "dashboard-github",
                        to: family,
                    }),
                );
                continue;
            }
            expect(
                (id === "device"
                    ? deviceScreens.get(error.id)
                    : gallery.find((entry) => entry.id === error.id)
                )?.title,
            ).toBe(
                id === "device" && error.id === "login-failed"
                    ? "Returning from GitHub"
                    : error.title,
            );
            expect(map.nodes.some((node) => node.id === error.id)).toBe(true);
            expect(
                map.edges.some(
                    (edge) =>
                        edge.from ===
                            (["app", "device"].includes(id)
                                ? "github-handoff"
                                : "loading") && edge.to === error.id,
                ),
            ).toBe(true);
        }
    }
    for (const error of Object.values(loginErrors))
        expect(
            accountActionScreens
                .find((screen) => screen.id === "account-auth-error")
                ?.variants?.some((variant) => variant.screen === error.id),
        ).toBe(true);
});

it("routes failed Enter login to its real error page before completing any journey", () => {
    for (const world of ["app", "device", "account", "topup"] as const) {
        for (const [code, error] of Object.entries(loginErrors)) {
            const before = {
                ...startJourney(),
                world,
                node: ["app", "device"].includes(world)
                    ? "github-handoff"
                    : "github-authorize",
            };
            const edge = journeyOptions(before).find(
                (edge) =>
                    edge.to ===
                    (world === "device" ? "device-session" : "loading"),
            );
            if (!edge) throw new Error("Missing login completion edge");
            const failed = journeyAdvance(before, edge, {
                ...defaultJourneySettings,
                loginResult: code as keyof typeof loginErrors,
            });
            expect(failed).toMatchObject({
                node: error.id,
                signedIn: false,
                connected: false,
                world,
            });
            const exit = journeyOptions(failed).find(
                (edge) => edge.label === error.action.label,
            );
            if (!exit) throw new Error("Missing login recovery action");
            const retry = error.id === loginErrors.default.id;
            const retryNode =
                world === "app"
                    ? "app-signing-in"
                    : world === "device"
                      ? "device-session"
                      : world === "account"
                        ? "enter-signed-out"
                        : "sign-in";
            expect(exit.to).toBe(retry ? retryNode : `${error.id}-exit`);
            expect(journeyAdvance(failed, exit)).toMatchObject({
                node: retry ? retryNode : `${error.id}-exit`,
                world,
                signedIn: false,
            });
            if (retry && world === "app")
                expect(journeyOptions(failed)).toContainEqual(
                    expect.objectContaining({
                        label: "Back to app",
                        to: "cancelled",
                    }),
                );
        }
    }
});

it("recognizes the ban code emitted by Better Auth and keeps unknown failures generic", () => {
    expect(getLoginError("BANNED_USER")).toBe(loginErrors.banned);
    expect(getLoginError("banned")).toBe(loginErrors.banned);
    expect(getLoginError(loginErrors.staging.code)).toBe(loginErrors.staging);
    expect(appLoginScreens.has(loginErrors.staging.id)).toBe(true);
    expect(
        appLoginEdges.some(
            (edge) =>
                edge.from === "github-handoff" &&
                edge.to === loginErrors.staging.id,
        ),
    ).toBe(true);
    for (const code of [
        "",
        "state_mismatch",
        "unable_to_get_user_info",
        "toString",
    ])
        expect(getLoginError(code)).toBe(loginErrors.default);
});

it("keeps authentication in main flows and purchases in signed-in top-up flows", () => {
    for (const flow of ["app", "account"] as const) {
        const main = galleryScreensForFlow(flow, "main");
        const topup = galleryScreensForFlow(flow, "topup");
        const represented = new Set(
            [
                ...main,
                ...topup,
                ...(flow === "account"
                    ? dashboardSections.flatMap(({ id }) =>
                          galleryScreensForFlow("account", id),
                      )
                    : []),
            ].map((entry) => entry.id),
        );
        for (const entry of galleryScreensForFlow(flow))
            expect(represented.has(entry.id)).toBe(true);
        expect(
            topup.some((entry) =>
                ["sign-in", "enter-signed-out", "loading"].includes(entry.id),
            ),
        ).toBe(false);
        expect(
            topup
                .flatMap((entry) => entry.variants ?? [])
                .some(
                    (variant) => variant.params?.topup_case === "sign-in-error",
                ),
        ).toBe(false);
        const map = getFlowFocus(flow, "topup");
        for (const id of [
            "sign-in",
            "enter-signed-out",
            "loading",
            "github-session",
            ...Object.values(loginErrors).map((error) => error.id),
        ])
            expect(map.nodeIds.has(id)).toBe(false);
        for (const error of Object.values(loginErrors)) {
            expect(
                main.some(
                    (entry) =>
                        entry.id === error.id ||
                        entry.variants?.some(
                            (variant) => variant.screen === error.id,
                        ),
                ),
            ).toBe(true);
            expect(topup.some((entry) => entry.id === error.id)).toBe(false);
        }
    }
    expect(
        galleryScreensForFlow("app", "main").some((entry) =>
            entry.id.startsWith("add-pollen"),
        ),
    ).toBe(false);
    expect(
        galleryScreensForFlow("app", "topup").some(
            (entry) => entry.id === "consent",
        ),
    ).toBe(false);
    expect(
        galleryScreensForFlow("account", "topup").some(
            (entry) => entry.id === "key-edit",
        ),
    ).toBe(false);
    expect(galleryScreensForFlow("account", "topup")).toEqual(
        getDashboardFlow("topup").screens,
    );
});

it("starts each top-up journey at the right screen and filters its map", () => {
    expect(
        startSelectedJourney({ world: "app", section: "topup" }),
    ).toMatchObject({
        world: "topup",
        node: "account-app",
        signedIn: true,
    });
    expect(
        startSelectedJourney({ world: "account", section: "topup" }),
    ).toMatchObject({
        world: "account",
        node: "enter-connected",
        signedIn: true,
    });
    const app = getFlowFocus("app", "topup");
    expect([...app.nodeIds]).toEqual([
        "account-app",
        "account-key",
        "account-wallet",
        "account-github",
        "account-auth-error",
        "account-payment",
        "account-billing",
    ]);
    expect(app.edges).toContainEqual({
        from: "account-key",
        to: "account-wallet",
        label: "Wallet · separate tab",
    });
    expect(app.nodeIds.has("consent")).toBe(false);
    const account = getFlowFocus("account", "topup");
    expect(account.nodeIds.has("account-checkout")).toBe(true);
    expect(account.nodeIds.has("keys")).toBe(false);
    expect(
        getFlowFocus("account", "main").nodeIds.has("account-checkout"),
    ).toBe(false);
});

it("shows every configured state as its own page with the original render parameters", () => {
    for (const { id } of entrances) {
        for (const { id: section } of dashboardSections) {
            if (!["main", "topup"].includes(section) && id !== "account")
                continue;
            if (section === "topup" && id !== "app" && id !== "account")
                continue;
            const source = galleryScreensForFlow(id, section);
            const expectedUrls = source.flatMap((entry) =>
                entry.variants?.length
                    ? entry.variants.map((_, index) =>
                          canvasScreenUrl(entry, index),
                      )
                    : [canvasScreenUrl(entry)],
            );
            const pages = galleryPagesForFlow(id, section);
            expect(pages.map((entry) => canvasScreenUrl(entry))).toEqual(
                expectedUrls,
            );
            expect(
                pages.every((entry) => (entry.variants?.length ?? 0) <= 1),
            ).toBe(true);
            expect(new Set(pages.map((entry) => entry.id)).size).toBe(
                pages.length,
            );
        }
    }
    const account = galleryPagesForFlow("account", "topup");
    expect(account).toHaveLength(21);
    expect(
        account.map((entry) => entry.variants?.[0].params?.account_case),
    ).toContain("pending");
    expect(
        account.map((entry) => entry.variants?.[0].params?.account_case),
    ).toContain("payment-error");
    expect(
        account.map((entry) => entry.variants?.[0].params?.account_case),
    ).toContain("credited");
});

it("shows the shared app sign-in UI once while keeping each visible sign-in state", () => {
    const pages = galleryPagesForFlow("app", "main");
    const signIn = pages.filter((entry) => entry.id.startsWith("sign-in"));
    expect(signIn.map((entry) => entry.title)).toEqual([
        "Sign in to Pollinations · Ready",
        "Sign in to Pollinations · Checking app",
        "Sign in to Pollinations · Signing in",
        "Sign in to Pollinations · Sign-in failed",
    ]);
    expect(pages.some((entry) => entry.title.startsWith("Check account"))).toBe(
        true,
    );
    expect(
        canvasGroups
            .flatMap((group) => group.screens)
            .find((entry) => entry.id === "sign-in")
            ?.variants?.some((variant) => variant.label === "Simple BYOP"),
    ).toBe(true);
});

it("groups configuration controls without hiding loading, success, or error states", () => {
    for (const { id } of entrances) {
        for (const { id: section } of dashboardSections) {
            if (!["main", "topup"].includes(section) && id !== "account")
                continue;
            if (section === "topup" && id !== "app" && id !== "account")
                continue;
            const pages = galleryPagesForFlow(id, section);
            const cards = galleryCardsForFlow(id, section);
            const cardUrls = cards.flatMap((entry) =>
                entry.variants?.length
                    ? entry.variants.map((_, index) =>
                          canvasScreenUrl(entry, index),
                      )
                    : [canvasScreenUrl(entry)],
            );
            expect(cardUrls.sort()).toEqual(
                pages.map((entry) => canvasScreenUrl(entry)).sort(),
            );
            for (const card of cards) {
                if (id === "app" && section === "main") {
                    const counts: Record<string, number> = {
                        "Sign in to Pollinations": 4,
                        "Pollinations sign-in error": 4,
                        "App connection error": 15,
                        "Allow access": 5,
                        "App · Connection status": 7,
                    };
                    if (card.title in counts)
                        expect(card.variants).toHaveLength(counts[card.title]);
                    continue;
                }
                if (id === "admin") {
                    expect(adminScreens).toContainEqual(card);
                    continue;
                }
                if (id === "account") {
                    expect(dashboardScreens).toContainEqual(card);
                    continue;
                }
                if (id === "app" && section === "topup") {
                    expect(accountActionScreens).toContainEqual(card);
                    continue;
                }
                if (id === "device") {
                    expect(deviceGalleryScreens).toContainEqual(card);
                    continue;
                }
                if (card.title === "Connection failed") {
                    expect(
                        card.variants?.every(
                            (variant) =>
                                variant.error &&
                                variant.params?.action === "authorize",
                        ),
                    ).toBe(true);
                    continue;
                }
                if (
                    card.variants?.some(
                        (variant) =>
                            variant.params?.result || variant.params?.session,
                    )
                )
                    expect(card.variants).toHaveLength(1);
            }
        }
    }
    const app = galleryCardsForFlow("app", "main");
    expect(app.filter((entry) => entry.title === "Allow access")).toHaveLength(
        1,
    );
    expect(
        app
            .find((entry) => entry.id === "consent")
            ?.variants?.map(({ label }) => label),
    ).toEqual([
        "Ready",
        "Checking app",
        "Loading models",
        "Models unavailable",
        "Connecting",
    ]);
    expect(
        app.some((entry) => entry.title === "Allow access · Connecting"),
    ).toBe(false);
    expect(
        app.some((entry) => entry.title === "Allow access · Checking app"),
    ).toBe(false);
    expect(
        app
            .flatMap((entry) => entry.variants ?? [])
            .some((variant) => variant.screen === "device-consent"),
    ).toBe(false);
});

it("groups matching request errors while preserving identity, phase, and recovery differences", () => {
    const app = galleryCardsForFlow("app", "main");
    const blocked = app.filter(
        (entry) => entry.title === "App connection error",
    );
    expect(blocked).toHaveLength(1);
    expect(blocked[0].variants).toHaveLength(15);
    const expectedReasons = [
        "redirect",
        "app",
        "lookup",
        "missing-redirect",
        "invalid-redirect",
        "redirect-scheme",
        "response-type",
        "missing-client",
        "missing-challenge",
        "challenge-method",
        "invalid-challenge",
    ].sort();
    expect(
        blocked[0].variants
            ?.filter((variant) => variant.params?.request_error)
            .map((variant) => variant.params?.request_error)
            .sort(),
    ).toEqual(expectedReasons);
    // Session and return-page availability are independent controls, not duplicate errors.
    expect(blocked[0].variants?.some((variant) => variant.params?.origin)).toBe(
        false,
    );
    expect(
        app
            .find((entry) => entry.title === "App connection error")
            ?.variants?.filter((variant) => variant.params?.authorize_error)
            .map((variant) => variant.params?.authorize_error),
    ).toEqual(authorizeFailures.map(({ id }) => id));
    const device = galleryCardsForFlow("device", "main");
    const errors = device.find((entry) => entry.id === "device-errors");
    expect(
        errors?.variants?.flatMap((variant) =>
            variant.params?.request_error ? [variant.params.request_error] : [],
        ),
    ).toEqual(["app", "lookup"]);
    const codes = device.find((entry) => entry.id === "device-code");
    expect(
        codes?.variants?.flatMap((variant) =>
            variant.params?.device_info ? [variant.params.device_info] : [],
        ),
    ).toEqual(["invalid", "expired", "used", "unavailable"]);
    expect(device.some((entry) => entry.screen === "oauth-signed-out")).toBe(
        false,
    );
    expect(getFlowFocus("app", "main").nodeIds.has("blocked")).toBe(true);
    expect(getFlowFocus("device").nodeIds.has("connection-link")).toBe(false);
});

it("uses exactly the same Apps Login cards and variant URLs in Map, Screens and Journey", () => {
    const cards = galleryCardsForFlow("app", "main");
    const map = getFlowFocus("app", "main");
    const managed = [...appLoginScreens.values()];
    const urls = (entries: typeof cards) =>
        [
            ...new Set(
                entries.flatMap((entry) =>
                    (entry.variants?.length ? entry.variants : [undefined]).map(
                        (_, index) => canvasScreenUrl(entry, index),
                    ),
                ),
            ),
        ].sort();
    expect(urls(managed)).toEqual(urls(cards));
    for (const card of cards) {
        const binding = [...appLoginScreens].find(
            ([, entry]) => entry.id === card.id,
        );
        if (!binding) throw new Error(`Missing binding: ${card.id}`);
        expect(map.nodes.find((node) => node.id === binding[0])?.screen).toBe(
            card.id,
        );
        card.variants?.forEach((variant, index) => {
            expect(canvasScreenUrl(binding[1], index)).toBe(
                canvasScreenUrl(card, index),
            );
            if (variant.params?.request_error)
                expect(
                    appLoginVariant(card, variant.params.request_error),
                ).toBe(index);
        });
    }
    for (const edge of appLoginEdges) {
        expect(map.nodeIds.has(edge.from)).toBe(true);
        expect(map.nodeIds.has(edge.to)).toBe(true);
    }
    for (const id of ["connection-link", "app-unverified", "app-invalid-link"])
        expect(map.nodeIds.has(id)).toBe(false);
    for (const signedIn of [false, true]) {
        const state = { ...startJourney(), signedIn, node: "blocked" };
        for (const reason of [
            "redirect",
            "app",
            "lookup",
            "missing-client",
            "missing-redirect",
        ]) {
            const exits = journeyOptions(state, {
                ...defaultJourneySettings,
                appRequestError: reason,
            });
            expect(exits.some((edge) => edge.to === "app-connect")).toBe(
                ["redirect", "missing-redirect"].includes(reason),
            );
            expect(exits.some((edge) => edge.to === "app-home")).toBe(false);
            expect(
                exits
                    .filter((edge) => edge.label === "Try again")
                    .map((edge) => edge.to),
            ).toEqual(
                reason === "lookup"
                    ? [signedIn ? "app-checking" : "app-sign-in-checking"]
                    : [],
            );
        }
    }
    expect(
        journeyOptions({
            ...startJourney(),
            node: "app-connection-failed",
        }).map((edge) => edge.to),
    ).toEqual(["cancelled"]);
});

it("shares sign-in failure UI while retaining both failure and retry paths", () => {
    const failures = galleryCardsForFlow("app", "main").filter(
        (entry) => entry.title === "Pollinations sign-in error",
    );
    expect(failures).toHaveLength(1);
    const card = failures[0];
    expect(card.variants).toHaveLength(4);
    expect(card.variants?.[0].params).toEqual({
        action: "sign-in",
        result: "error",
    });
    expect(card.variants?.[1]).toMatchObject({
        screen: "login-failed",
        params: { login_error: "unknown", login_flow: "app" },
    });
    for (const [index, from, to] of [
        [0, "app-signing-in", "error"],
        [1, "github-handoff", "login-failed"],
    ] as const) {
        const entry = appLoginScreens.get(to);
        if (!entry) throw new Error(`Missing failure binding: ${to}`);
        expect(canvasScreenUrl(entry)).toBe(canvasScreenUrl(card, index));
        expect(
            appLoginEdges.some((edge) => edge.from === from && edge.to === to),
        ).toBe(true);
        expect(
            journeyOptions({ ...startJourney(), node: to }).map(
                ({ to, label }) => ({ to, label }),
            ),
        ).toEqual([
            { to: "app-signing-in", label: "Try again" },
            { to: "cancelled", label: "Back to app" },
        ]);
    }
});

it("routes dashboard and funding links without depending on their visible labels", () => {
    for (const node of ["app-connected", "consent"]) {
        expect(
            journeyOptions({ ...startJourney(), node }).find(
                (edge) => edge.action === "dashboard",
            )?.to,
        ).toBe("app-home");
    }
    const consent = { ...startJourney(), node: "consent", signedIn: true };
    const funding = journeyOptions(consent).find(
        (edge) => edge.action === "fund-account",
    );
    if (!funding) throw new Error("Missing account funding exit");
    const outcome = journeyAdvance(consent, funding);
    expect(outcome.node).toBe("account-funding");
    expect(outcome.connected).toBe(false);
    expect(outcome.paid).toBe(consent.paid);
    expect(outcome.budget).toBe(consent.budget);
});

it("exposes submission failures on the same page and routes the selected journey outcome", () => {
    const entry = appLoginScreens.get("app-connection-failed");
    if (!entry) throw new Error("Missing submission failure screen");
    for (const { id } of authorizeFailures) {
        const variant = appLoginVariant(entry, id);
        expect(entry.variants?.[variant].params?.authorize_error).toBe(id);
        expect(
            appLoginAutomaticDestination(
                { ...startJourney(), node: "app-connecting" },
                {
                    ...defaultJourneySettings,
                    authorizationError: id,
                },
            ),
        ).toBe("app-connection-failed");
    }
    expect(
        galleryCardsForFlow("device", "main")
            .flatMap((card) => card.variants ?? [])
            .some((variant) => variant.params?.authorize_error === "code"),
    ).toBe(false);
});

it("models parallel app lookup and local validation without inventing mandatory loading steps", () => {
    const loading = { ...startJourney(), node: "loading" };
    expect(appLoginAutomaticDestination(loading, defaultJourneySettings)).toBe(
        "sign-in",
    );
    expect(
        appLoginAutomaticDestination(
            { ...loading, signedIn: true },
            defaultJourneySettings,
        ),
    ).toBe("consent");
    for (const signedIn of [false, true]) {
        const state = { ...loading, signedIn };
        const settings = { ...defaultJourneySettings, slowAppLookup: true };
        expect(appLoginAutomaticDestination(state, settings)).toBe(
            signedIn ? "app-checking" : "app-sign-in-checking",
        );
        for (const reason of [
            "missing-redirect",
            "invalid-redirect",
            "response-type",
            "missing-client",
            "missing-challenge",
            "challenge-method",
            "invalid-challenge",
        ]) {
            const destination = appLoginAutomaticDestination(state, {
                ...settings,
                appRequestError: reason,
            });
            expect(destination).toBe("blocked");
            expect(
                appLoginAutomaticDestination(state, {
                    ...settings,
                    slowAppLookup: false,
                    appRequestError: reason,
                }),
            ).toBe("blocked");
            expect(
                journeyOptions(state).some((edge) => edge.to === destination),
            ).toBe(true);
        }
    }
    const map = getFlowFocus("app", "main");
    expect(
        map.edges.some(
            (edge) =>
                edge.from === "loading" && edge.to === "account-deactivated",
        ),
    ).toBe(false);
    expect(
        map.edges.some(
            (edge) =>
                edge.from === "github-handoff" &&
                edge.to === "account-deactivated",
        ),
    ).toBe(true);
});

it("keeps the Apps top-up exit as a handoff rather than embedding its screens in Login", () => {
    const map = getFlowFocus("app", "main");
    expect(
        map.nodes.find((node) => node.id === "account-key-editor"),
    ).toMatchObject({ kind: "outcome" });
    expect(
        map.nodes.find((node) => node.id === "account-key-editor")?.screen,
    ).toBeUndefined();
    const state = {
        ...startJourney(),
        node: "app-connected",
        signedIn: true,
        connected: true,
    };
    const edge = journeyOptions(state).find(
        (edge) => edge.to === "account-key-editor",
    );
    if (!edge) throw new Error("Missing top-up handoff");
    expect(journeyAdvance(state, edge)).toMatchObject({
        world: "app",
        node: "account-key-editor",
    });
});

it("bookends Apps Login with the existing reusable app components", () => {
    const cards = galleryCardsForFlow("app", "main");
    expect(cards[0]).toMatchObject({
        id: "app-connect",
        screen: "add-pollen-connect",
        maintained: true,
    });
    expect(cards.at(-1)).toMatchObject({
        id: "app-connected",
        screen: "add-pollen-play",
        maintained: true,
    });
    expect(cards[0].variants).toBeUndefined();
    expect(cards.at(-1)?.variants).toHaveLength(7);
    for (const id of ["app-connect", "app-connected"]) {
        const card = cards.find((card) => card.id === id);
        expect(appLoginScreens.get(id)).toEqual(card);
        expect(
            getFlowFocus("app", "main").nodes.find((node) => node.id === id)
                ?.screen,
        ).toBe(id);
    }
    const topup = galleryCardsForFlow("app", "topup");
    expect(topup.map((card) => card.screen)).toEqual([
        "add-pollen-play",
        "account-key",
        "account-wallet",
        "account-github",
        "login-failed",
        "account-payment",
        "account-billing",
    ]);
    expect(topup[0].variants?.[0].params?.app_menu).toBe("open");
});

it("covers the SDK callback, cancellation feedback, retry, and legacy return", () => {
    const start = startJourney();
    const connect = journeyOptions(start).find((edge) => edge.to === "loading");
    if (!connect) throw new Error("Missing app connect action");
    expect(
        journeyAdvance(start, connect, {
            ...defaultJourneySettings,
            appConnectionError: "start",
        }).node,
    ).toBe("app-callback-error");
    const oauth = { ...startJourney(), signedIn: true, node: "app-connecting" };
    expect(appLoginAutomaticDestination(oauth, defaultJourneySettings)).toBe(
        "app-callback",
    );
    expect(
        appLoginAutomaticDestination(
            { ...oauth, node: "app-callback" },
            defaultJourneySettings,
        ),
    ).toBe("app-connected");
    expect(
        appLoginAutomaticDestination(
            { ...oauth, node: "app-callback" },
            { ...defaultJourneySettings, appConnectionError: "callback" },
        ),
    ).toBe("app-callback-error");
    const consent = { ...oauth, node: "consent" };
    const cancel = journeyOptions(consent).find(
        (edge) => edge.to === "cancelled",
    );
    if (!cancel) throw new Error("Missing consent cancellation");
    expect(journeyAdvance(consent, cancel)).toMatchObject({
        node: "app-callback-error",
        signedIn: true,
        connected: false,
    });
    expect(journeyAdvance({ ...consent, method: "direct" }, cancel).node).toBe(
        "app-connect",
    );
    const failed = { ...oauth, node: "app-callback-error", connected: false };
    const retry = journeyOptions(failed).find(
        (edge) => edge.label === "Connect with Pollinations",
    );
    if (!retry) throw new Error("Missing SDK retry action");
    expect(journeyAdvance(failed, retry).node).toBe("loading");
    expect(
        appLoginAutomaticDestination(
            { ...oauth, method: "direct" },
            defaultJourneySettings,
        ),
    ).toBe("app-connected");
});

it("does not expose a return action without a known originating app page", () => {
    const settings = {
        ...defaultJourneySettings,
        appReturnPage: false,
        appRequestError: "redirect",
    };
    for (const signedIn of [false, true]) {
        const edges = journeyOptions(
            { ...startJourney(), node: "blocked", signedIn },
            settings,
        );
        expect(edges.some((edge) => edge.label === "Back to app")).toBe(false);
        expect(edges.some((edge) => edge.to === "app-home")).toBe(false);
    }
});

it("uses the canonical Apps graph by default and checks stored keys before connecting", () => {
    expect(getFlowFocus("app")).toEqual(getFlowFocus("app", "main"));
    expect(flowNodes.some((node) => node.id === "app-ready")).toBe(false);
    const start = { ...startJourney(), node: "app-ready", connected: true };
    const connect = journeyOptions(start).find(
        (edge) => edge.to === "app-callback",
    );
    if (!connect) throw new Error("Missing connection action");
    const checking = journeyAdvance(start, connect);
    expect(checking.node).toBe("app-callback");
    for (const [storedKeyStatus, destination] of [
        ["valid", "app-connected"],
        ["invalid", "app-connect"],
        ["unavailable", "app-callback-error"],
    ] as const) {
        const settings = { ...defaultJourneySettings, storedKeyStatus };
        expect(appLoginAutomaticDestination(checking, settings)).toBe(
            destination,
        );
        const route = journeyOptions(checking).find(
            (edge) => edge.to === destination,
        );
        if (!route) throw new Error("Missing stored-key result route");
        expect(journeyAdvance(checking, route, settings).connected).toBe(
            storedKeyStatus === "valid",
        );
    }
});

it("retries a stored-key check without going through sign-in", () => {
    const checking = {
        ...startJourney(),
        node: "app-callback",
        connected: true,
    };
    const failedRoute = journeyOptions(checking).find(
        (edge) => edge.to === "app-callback-error",
    );
    if (!failedRoute) throw new Error("Missing validation failure");
    const failed = journeyAdvance(checking, failedRoute);
    expect(failed.scenario).toBe("key-check");
    const options = journeyOptions(failed);
    expect(options.map((edge) => edge.label)).toEqual(["Try again"]);
    const retry = journeyAdvance(failed, options[0]);
    expect(retry).toMatchObject({ node: "app-callback", connected: true });
    expect(appLoginAutomaticDestination(retry, defaultJourneySettings)).toBe(
        "app-connected",
    );
    const cards = galleryCardsForFlow("app", "main");
    const panel = cards.find((card) => card.id === "app-connected");
    expect(
        panel?.variants?.find((variant) => variant.label === "Limit reached"),
    ).toMatchObject({ params: { sim_budget: "0" } });
    expect(
        panel?.variants
            ?.slice(0, 4)
            .map((variant) => variant.params?.app_callback),
    ).toEqual([undefined, "waiting", "error", "check-error"]);
    expect(cards.some((card) => card.id.startsWith("app-callback"))).toBe(
        false,
    );
    const states = appLoginScreens.get("app-callback-error");
    expect(states?.variants).toEqual(panel?.variants?.slice(2, 4));
});

it("keeps account-detail failures on the return panel and retries account loading", () => {
    const cards = galleryCardsForFlow("app", "main");
    expect(cards[0].variants).toBeUndefined();
    expect(cards.at(-1)?.title).toBe("App · Connection status");
    const connected = {
        ...startJourney(),
        node: "app-connected",
        signedIn: true,
        connected: true,
    };
    expect(
        appLoginAutomaticDestination(connected, {
            ...defaultJourneySettings,
            accountStatus: "unavailable",
        }),
    ).toBe("app-account-error");
    expect(
        cards
            .at(-1)
            ?.variants?.filter((variant) =>
                variant.params?.app_account?.endsWith("error"),
            ),
    ).toEqual([
        {
            label: "Account details unavailable",
            params: { app_account: "account-error" },
        },
    ]);
    const error = { ...connected, node: "app-account-error" };
    const retry = journeyOptions(error).find(
        (edge) => edge.label === "Try again",
    );
    if (!retry) throw new Error("Missing account retry");
    expect(journeyAdvance(error, retry).node).toBe("app-connected");
    expect(
        appLoginAutomaticDestination(connected, defaultJourneySettings),
    ).toBeUndefined();
    expect(
        appLoginAutomaticDestination(connected, {
            ...defaultJourneySettings,
            accountStatus: "unauthorized",
        }),
    ).toBe("app-connect");
    const revoked = journeyOptions(connected).find(
        (edge) => edge.label === "Key expired or revoked",
    );
    if (!revoked) throw new Error("Missing expired-key transition");
    const disconnected = journeyAdvance(connected, revoked);
    expect(disconnected.node).toBe("app-connect");
    expect(disconnected.connected).toBe(false);
    expect(disconnected.signedIn).toBe(true);
});

it("keeps session and protocol consistent for every blocked-request preview", () => {
    const blocked = appLoginScreens.get("blocked");
    if (!blocked) throw new Error("Missing blocked request screen");
    for (
        let variant = 0;
        variant < (blocked.variants?.length ?? 0);
        variant++
    ) {
        for (const method of ["oauth", "direct"] as const) {
            for (const signedIn of [false, true]) {
                expect(
                    appLoginPreviewScreen(blocked, variant, method, signedIn),
                ).toBe(signedIn ? method : `${method}-request-signed-out`);
            }
        }
    }
    const consent = appLoginScreens.get("consent");
    if (!consent) throw new Error("Missing consent screen");
    expect(appLoginPreviewScreen(consent, 0, "direct", true)).toBe("direct");
    const callback = appLoginScreens.get("app-callback");
    if (!callback) throw new Error("Missing callback state");
    expect(appLoginPreviewScreen(callback, 0, "oauth", true)).toBe(
        "add-pollen-connect",
    );
});

it("keeps app lookup reviewable inside its screen and explicit as a map check", () => {
    const cards = galleryCardsForFlow("app", "main");
    for (const [cardId, checkId] of [
        ["sign-in--0", "app-sign-in-checking"],
        ["consent", "app-checking"],
    ]) {
        const card = cards.find((entry) => entry.id === cardId);
        const state = appLoginScreens.get(checkId);
        if (!card?.variants || !state)
            throw new Error(`Missing lookup state: ${checkId}`);
        const index = card.variants.findIndex(
            (variant) => variant.params?.app_loading === "1",
        );
        expect(index).toBeGreaterThan(0);
        expect(canvasScreenUrl(card, index)).toBe(canvasScreenUrl(state));
        const check = getFlowFocus("app", "main").nodes.find(
            (node) => node.id === checkId,
        );
        expect(check).toMatchObject({
            kind: "decision",
            label: "App verified?",
        });
        expect(check?.screen).toBeUndefined();
    }
    expect(
        cards.filter((entry) => entry.title.endsWith("· Checking app")),
    ).toHaveLength(0);
    const device = galleryCardsForFlow("device", "main");
    const pending = device.find((entry) =>
        entry.variants?.some(
            (variant) => variant.params?.session === "loading",
        ),
    );
    expect(pending?.screen).toBe("device-signed-out");
    expect(pending?.title).toBe("Sign in to Pollinations");
});

it("uses one external GitHub handoff without simulating provider-internal steps", () => {
    const cards = galleryCardsForFlow("app", "main");
    const provider = cards.filter((entry) => entry.owner === "GitHub");
    expect(provider).toMatchObject([
        { id: "github-handoff", title: "Continue on GitHub" },
    ]);
    const map = getFlowFocus("app", "main");
    expect(
        map.nodes.filter((node) => node.id.startsWith("github-")),
    ).toMatchObject([{ id: "github-handoff" }]);
    const signing = { ...startJourney(), node: "app-signing-in" };
    expect(appLoginAutomaticDestination(signing, defaultJourneySettings)).toBe(
        "github-handoff",
    );
    const handoff = { ...signing, node: "github-handoff" };
    const complete = journeyOptions(handoff).find(
        (edge) => edge.to === "loading",
    );
    if (!complete) throw new Error("Missing provider return");
    for (const githubSignedIn of [false, true])
        for (const githubApproved of [false, true]) {
            expect(
                journeyAdvance(handoff, complete, {
                    ...defaultJourneySettings,
                    githubSignedIn,
                    githubApproved,
                }),
            ).toMatchObject({ node: "loading", signedIn: true });
        }
});

describe("shared Admin inventory", () => {
    it("uses the same five page families in Screens and Map", () => {
        expect(galleryCardsForFlow("admin")).toEqual(adminScreens);
        expect(galleryScreensForFlow("admin")).toEqual(adminScreens);
        expect(adminScreens).toHaveLength(5);
        const map = getFlowFocus("admin");
        expect(
            map.nodes
                .flatMap((node) => (node.screen ? [node.screen] : []))
                .sort(),
        ).toEqual(adminScreens.map((entry) => entry.id).sort());
        for (const entry of adminScreens)
            expect(map.edges.some((edge) => edge.from === entry.id)).toBe(true);
    });

    it("round-trips every preview state to the same Journey selection", () => {
        for (const entry of adminScreens)
            for (const [index] of (entry.variants ?? []).entries()) {
                const url = new URL(
                    canvasScreenUrl(entry, index),
                    "https://preview.example",
                );
                expect(adminSelectionForPreview(url.searchParams)).toEqual({
                    screen: entry.id,
                    variant: index,
                });
            }
    });

    it("retains retries, sign-out, and the existing-session shortcut", () => {
        const { edges } = getFlowFocus("admin");
        for (const [from, to] of [
            ["dashboard-sign-in", "admin-session"],
            ["admin-session", "identity"],
            ["admin-session", "admin-callback"],
            ["identity", "admin-github"],
            ["admin-callback", "dashboard-connected"],
            ["admin-callback", "dashboard-sign-in"],
            ["admin-auth-error", "identity"],
            ["dashboard-connected", "dashboard-sign-in"],
        ])
            expect(edges).toContainEqual(expect.objectContaining({ from, to }));
    });
});

it("preserves the Admin issuer request for retry without accepting another origin", () => {
    vi.stubGlobal(
        "location",
        new URL("https://enter.pollinations.ai/app/sign-in"),
    );
    try {
        clearSignInContext();
        const callback = oauthSignInCallback(
            "https://enter.pollinations.ai/app/sign-in?client_id=admin-example&state=preview-state&code_challenge=preview-challenge",
        );
        rememberSignIn(callback);
        expect(getSignInContext()?.path).toBe(
            "/api/auth/oauth2/authorize?client_id=admin-example&state=preview-state&code_challenge=preview-challenge",
        );
        rememberSignIn(
            "https://other.example/api/auth/oauth2/authorize?client_id=other",
        );
        expect(getSignInContext()?.path).toBe("/sign-in");
    } finally {
        clearSignInContext();
        vi.unstubAllGlobals();
    }
});
