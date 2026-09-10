import { describe, expect, it } from "vitest";
import {
    appLoginAutomaticDestination,
    appLoginEdges,
    appLoginPreviewScreen,
    appLoginScreens,
    appLoginVariant,
} from "../frontend/pollen-connect-app-login";
import {
    canvasGroups,
    canvasScreenUrl,
} from "../frontend/pollen-connect-canvas-data";
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
import { getLoginError, loginErrors } from "../frontend/src/lib/login-errors";

describe("Complete managed screen inventory", () => {
    const sources = canvasGroups.flatMap((group) => group.screens);
    const allGallery = entrances.flatMap(({ id }) => galleryScreensForFlow(id));
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
        expect(represented.has("add-pollen-pending")).toBe(true);
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

    it("keeps external provider and developer demo screens out of the gallery", () => {
        const managedIds = new Set(
            sources
                .filter(
                    (entry) =>
                        entry.owner === "Pollinations" || entry.maintained,
                )
                .map((entry) => entry.id),
        );
        for (const entry of allGallery)
            expect(managedIds.has(entry.id.replace(/-errors$/, ""))).toBe(true);
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
        ).toBe("Device");
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
            (entry) => entry.id === "dashboard-sign-in-errors",
        );
        expect(
            errors?.variants
                ?.map((variant) => variant.params?.auth_error)
                .sort(),
        ).toEqual(["admin_required", "invalid_state", "unavailable"]);
    });

    it("exposes account loading and payment waiting alongside their errors", () => {
        const account = galleryScreensForFlow("account");
        expect(
            account
                .find((entry) => entry.id === "enter-connected")
                ?.variants?.some(
                    (variant) => variant.params?.session === "loading",
                ),
        ).toBe(true);
        expect(
            account
                .find((entry) => entry.id === "enter-connected-errors")
                ?.variants?.some(
                    (variant) => variant.params?.session === "error",
                ),
        ).toBe(true);
        expect(
            galleryScreensForFlow("app").some(
                (entry) => entry.id === "add-pollen-pending-errors",
            ),
        ).toBe(true);
    });
});

it("starts Admin on Enter and uses the real sign-in error screen", () => {
    expect(entrances.find((entry) => entry.id === "admin")?.node).toBe(
        "identity",
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
            expect(gallery.find((entry) => entry.id === error.id)?.title).toBe(
                error.title,
            );
            expect(map.nodes.some((node) => node.id === error.id)).toBe(true);
            expect(
                map.edges.some(
                    (edge) =>
                        edge.from ===
                            (id === "app" ? "github-authorize" : "loading") &&
                        edge.to === error.id,
                ),
            ).toBe(true);
        }
    }
    for (const error of Object.values(loginErrors))
        expect(
            getFlowFocus("add-pollen").nodes.some(
                (node) => node.screen === error.id,
            ),
        ).toBe(true);
});

it("routes failed Enter login to its real error page before completing any journey", () => {
    for (const world of [
        "app",
        "device",
        "account",
        "admin",
        "topup",
    ] as const) {
        for (const [code, error] of Object.entries(loginErrors)) {
            const before = {
                ...startJourney(),
                world,
                node: "github-authorize",
            };
            const edge = journeyOptions(before).find(
                (edge) => edge.to === "loading",
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
                world === "account"
                    ? "enter-signed-out"
                    : world === "admin"
                      ? "dashboard-sign-in"
                      : "sign-in";
            expect(exit.to).toBe(retry ? retryNode : `${error.id}-exit`);
            expect(journeyAdvance(failed, exit)).toMatchObject({
                node: retry ? retryNode : `${error.id}-exit`,
                world,
                signedIn: false,
            });
        }
    }
});

it("recognizes the ban code emitted by Better Auth and keeps unknown failures generic", () => {
    expect(getLoginError("BANNED_USER")).toBe(loginErrors.banned);
    expect(getLoginError("banned")).toBe(loginErrors.banned);
    expect(getLoginError("staging_is_invite-only")).toBe(loginErrors.default);
    for (const { id } of entrances) {
        expect(
            galleryScreensForFlow(id).some((screen) =>
                screen.id.includes("staging-invite"),
            ),
        ).toBe(false);
    }
    expect(flowNodes.some((node) => node.id.includes("staging-invite"))).toBe(
        false,
    );
    expect(
        [...appLoginScreens.keys()].some((id) => id.includes("staging-invite")),
    ).toBe(false);
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
            [...main, ...topup].map((entry) => entry.id),
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
            expect(main.some((entry) => entry.id === error.id)).toBe(true);
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
    expect(
        galleryScreensForFlow("account", "topup")[0].variants?.[0].params
            ?.drawer,
    ).toBe("closed");
});

it("starts each top-up journey at the right screen and filters its map", () => {
    expect(
        startSelectedJourney({ world: "app", section: "topup" }),
    ).toMatchObject({
        world: "app",
        node: "app-connect",
        signedIn: false,
    });
    expect(
        startSelectedJourney({ world: "account", section: "topup" }),
    ).toMatchObject({
        world: "account",
        node: "enter-connected",
        signedIn: true,
    });
    const app = getFlowFocus("app", "topup");
    expect(app.nodeIds.has("add-pollen-amount")).toBe(true);
    expect(app.nodeIds.has("app-connect")).toBe(true);
    expect(app.nodeIds.has("app-login")).toBe(true);
    expect(app.edges).toContainEqual({
        from: "app-login",
        to: "app-connected",
        label: "Return signed in",
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
        for (const section of ["main", "topup"] as const) {
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
    expect(account).toHaveLength(3);
    expect(account.map((entry) => entry.variants?.[0].params?.session)).toEqual(
        [undefined, "loading", "error"],
    );
});

it("shows the shared app sign-in UI once while keeping each visible sign-in state", () => {
    const pages = galleryPagesForFlow("app", "main");
    const signIn = pages.filter((entry) => entry.id.startsWith("sign-in"));
    expect(signIn.map((entry) => entry.title)).toEqual([
        "Sign in to Pollinations · OAuth, BYOP & new accounts",
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
        for (const section of ["main", "topup"] as const) {
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
                if (
                    card.variants?.some(
                        (variant) =>
                            variant.params?.result ||
                            variant.params?.session ||
                            variant.params?.app_loading,
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
    expect(app.find((entry) => entry.id === "consent")?.variants?.length).toBe(
        1,
    );
    expect(
        app.some((entry) => entry.title === "Allow access · Connecting"),
    ).toBe(true);
    expect(
        app.some((entry) => entry.title === "Allow access · Checking app"),
    ).toBe(true);
    expect(
        app
            .flatMap((entry) => entry.variants ?? [])
            .some((variant) => variant.screen === "device-consent"),
    ).toBe(false);
});

it("groups matching request errors while preserving identity, phase, and recovery differences", () => {
    const app = galleryCardsForFlow("app", "main");
    const blocked = app.filter((entry) => entry.title === "Connection blocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0].variants).toHaveLength(10);
    const expectedReasons = [
        "redirect",
        "app",
        "lookup",
        "missing-redirect",
        "invalid-redirect",
        "response-type",
        "missing-client",
        "missing-challenge",
        "challenge-method",
        "invalid-challenge",
    ].sort();
    expect(
        blocked[0].variants
            ?.map((variant) => variant.params?.request_error)
            .sort(),
    ).toEqual(expectedReasons);
    // Session and return-page availability are independent controls, not duplicate errors.
    expect(
        blocked[0].variants?.some(
            (variant) => variant.screen || variant.params?.origin,
        ),
    ).toBe(false);
    expect(
        app.find((entry) => entry.title === "Connection failed")?.variants,
    ).toHaveLength(1);
    const device = galleryCardsForFlow("device", "main");
    expect(
        device
            .find((entry) => entry.title === "App could not be verified")
            ?.variants?.map((variant) => variant.params?.request_error),
    ).toEqual(["app", "lookup"]);
    expect(
        device
            .find((entry) => entry.title === "Device code no longer usable")
            ?.variants?.map((variant) => variant.screen),
    ).toEqual(["device-error", "device-used"]);
    expect(device.some((entry) => entry.title.includes("Invalid code"))).toBe(
        true,
    );
    expect(
        device.some((entry) => entry.title.includes("Verification failed")),
    ).toBe(true);
    expect(device.some((entry) => entry.screen === "oauth-signed-out")).toBe(
        false,
    );
    expect(getFlowFocus("app", "main").nodeIds.has("blocked")).toBe(true);
    expect(getFlowFocus("device").nodeIds.has("connection-link")).toBe(false);
});

it("uses exactly the same Apps Login cards and variant URLs in Map, Screens and Journey", () => {
    const cards = galleryCardsForFlow("app", "main");
    const map = getFlowFocus("app", "main");
    const managed = [...appLoginScreens.values()].filter(
        (entry) => entry.owner === "Pollinations" || entry.maintained,
    );
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
            expect(exits.some((edge) => edge.to === "app-home")).toBe(signedIn);
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
    ).toEqual(["cancelled", "app-home"]);
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
                edge.from === "github-authorize" &&
                edge.to === "account-deactivated",
        ),
    ).toBe(true);
});

it("keeps the Apps top-up exit as a handoff rather than embedding its screens in Login", () => {
    const map = getFlowFocus("app", "main");
    expect(
        map.nodes.find((node) => node.id === "add-pollen-amount"),
    ).toMatchObject({ kind: "outcome" });
    expect(
        map.nodes.find((node) => node.id === "add-pollen-amount")?.screen,
    ).toBeUndefined();
    const state = {
        ...startJourney(),
        node: "app-connected",
        signedIn: true,
        connected: true,
    };
    const edge = journeyOptions(state).find(
        (edge) => edge.to === "add-pollen-amount",
    );
    if (!edge) throw new Error("Missing top-up handoff");
    expect(journeyAdvance(state, edge)).toMatchObject({
        world: "topup",
        node: "add-pollen-amount",
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
    expect(cards.at(-1)?.variants).toHaveLength(8);
    for (const id of ["app-connect", "app-connected"]) {
        const card = cards.find((card) => card.id === id);
        expect(appLoginScreens.get(id)).toEqual(card);
        expect(
            getFlowFocus("app", "main").nodes.find((node) => node.id === id)
                ?.screen,
        ).toBe(id);
    }
    const topup = galleryCardsForFlow("app", "topup");
    expect(topup.slice(0, 3).map((card) => card.screen)).toEqual([
        "add-pollen-connect",
        "add-pollen-play",
        "add-pollen-play",
    ]);
    expect(topup[2].variants?.[0].params?.app_menu).toBe("open");
    expect(topup[3].screen).toBe("add-pollen-amount");
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
        expect(edges.some((edge) => edge.to === "app-home")).toBe(signedIn);
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
    expect(cards.at(-1)?.title).toBe("App · Return to app");
    const connected = {
        ...startJourney(),
        node: "app-connected",
        signedIn: true,
        connected: true,
    };
    for (const accountDetailsError of [
        "profile-error",
        "key-error",
        "account-error",
    ] as const) {
        expect(
            appLoginAutomaticDestination(connected, {
                ...defaultJourneySettings,
                accountDetailsError,
            }),
        ).toBe("app-account-error");
    }
    const error = { ...connected, node: "app-account-error" };
    const retry = journeyOptions(error).find(
        (edge) => edge.label === "Try again",
    );
    if (!retry) throw new Error("Missing account retry");
    expect(journeyAdvance(error, retry).node).toBe("app-connected");
    expect(
        appLoginAutomaticDestination(connected, defaultJourneySettings),
    ).toBeUndefined();
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
