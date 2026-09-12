import { loginErrors } from "@shared/auth/login-errors.ts";
import { describe, expect, it } from "vitest";
import { canvasScreenUrl } from "../frontend/pollen-connect-canvas-data";
import {
    deviceAutomaticDestination,
    deviceCodeResults,
    devicePreviewOverrides,
    deviceRequestResults,
    deviceSubmitResults,
    getDeviceFlow,
} from "../frontend/pollen-connect-device";
import { getFlowFocus } from "../frontend/pollen-connect-diagram";
import {
    galleryCardsForFlow,
    galleryPagesForFlow,
} from "../frontend/pollen-connect-gallery-data";
import {
    applyJourneyConsent,
    defaultJourneySettings,
    type JourneySettings,
    type JourneyState,
    journeyAdvance,
    journeyOptions,
    startJourney,
    startSelectedJourney,
} from "../frontend/pollen-connect-journey-state";

function step(
    state: JourneyState,
    label: string,
    settings = defaultJourneySettings,
) {
    const edge = journeyOptions(state, settings).find(
        (edge) => edge.label === label,
    );
    if (!edge) throw new Error(`Missing action: ${state.node}: ${label}`);
    return journeyAdvance(state, edge, settings);
}
function settle(state: JourneyState, settings = defaultJourneySettings) {
    for (let i = 0; i < 8; i++) {
        const destination = deviceAutomaticDestination(state, settings);
        if (!destination) return state;
        const edge = journeyOptions(state, settings).find(
            (edge) => edge.to === destination,
        );
        if (!edge)
            throw new Error(`Missing route: ${state.node} → ${destination}`);
        state = journeyAdvance(state, edge, settings);
    }
    throw new Error("Device did not reach a screen");
}
const consent: JourneyState = {
    ...startJourney("device"),
    signedIn: true,
    node: "consent",
    deviceCode: "ABCDEFGH",
    deviceConsentRoute: true,
};

describe("one device inventory", () => {
    it.each([
        "main",
        "link",
    ] as const)("uses identical variant URLs in Screens, Map and Journey for %s", (section) => {
        const { screens: deviceScreens, map: deviceMap } =
            getDeviceFlow(section);
        const map = getFlowFocus("device", section);
        expect(map.nodes).toEqual(deviceMap.nodes);
        expect(map.edges).toEqual(deviceMap.edges);
        const pages = galleryPagesForFlow("device", section);
        const galleryUrls = pages
            .filter((entry) => !entry.illustration)
            .map((entry) => canvasScreenUrl(entry))
            .sort();
        const stateUrls = [...deviceScreens.values()]
            .filter((entry) => !entry.illustration)
            .flatMap((entry) =>
                (entry.variants ?? [{}]).map((_, i) =>
                    canvasScreenUrl(entry, i),
                ),
            )
            .sort();
        expect(galleryUrls).toEqual(stateUrls);
        const mapUrls = [...deviceMap.screens.values()]
            .filter((entry) => !entry.illustration)
            .flatMap((entry) =>
                (entry.variants ?? [{}]).map((_, i) =>
                    canvasScreenUrl(entry, i),
                ),
            )
            .sort();
        expect(mapUrls).toEqual(stateUrls);
        expect(new Set(galleryUrls).size).toBe(galleryUrls.length);
        expect(
            galleryCardsForFlow("device", section)
                .filter((entry) => entry.owner === "Pollinations")
                .map((entry) => entry.title),
        ).toEqual([
            "Sign in to Pollinations",
            "Pollinations sign-in error",
            section === "link" ? "Enter another code" : "Enter device code",
            "Allow access",
            "Device connection error",
            "Device approval result",
        ]);
        for (const node of map.nodes) {
            const entry = deviceMap.screens.get(node.id);
            if (node.screen) expect(entry?.id).toBe(node.screen);
            if (node.kind === "decision") expect(entry?.screen).toBeDefined();
        }
    });
    it.each([
        "main",
        "link",
    ] as const)("groups map errors without adding recovery actions for %s", (section) => {
        const flow = getDeviceFlow(section);
        expect(flow.map.nodes).toHaveLength(flow.nodes.length - 5);
        const ids = new Set(flow.map.nodes.map((node) => node.id));
        for (const edge of flow.map.edges) {
            expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
        }
        for (const id of [
            "device-code-invalid",
            "device-code-expired",
            "device-code-used",
            "device-request-invalid",
            "device-request-expired",
            "device-request-used",
            "device-submit-key",
            "device-submit-approve",
        ]) {
            const sourceActions = flow.edges
                .filter((edge) => edge.from === id)
                .map((edge) => [edge.to, edge.label]);
            const mapActions = flow.map.edges
                .filter((edge) => edge.from === flow.map.nodeForState(id))
                .map((edge) => [edge.to, edge.label]);
            expect(mapActions, id).toEqual(sourceActions);
        }
        // An unavailable request has no verified app to cancel; app lookup does.
        expect(flow.map.nodeForState("device-request-unavailable")).not.toBe(
            flow.map.nodeForState("device-request-lookup"),
        );
        expect(flow.map.nodeForState("device-submit-deny")).not.toBe(
            flow.map.nodeForState("device-submit-key"),
        );
    });
    it.each([
        "main",
        "link",
    ] as const)("has no dangling or unreachable routes and one GitHub handoff for %s", (section) => {
        const { nodes: deviceNodes, edges: deviceEdges } =
            getDeviceFlow(section);
        const ids = new Set(deviceNodes.map((node) => node.id));
        expect(ids.size).toBe(deviceNodes.length);
        const reachable = new Set(["device-start"]);
        for (let pass = 0; pass < deviceNodes.length; pass++)
            for (const edge of deviceEdges) {
                expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
                if (reachable.has(edge.from)) reachable.add(edge.to);
            }
        expect([...reachable].sort()).toEqual([...ids].sort());
        for (const node of deviceNodes)
            if (!node.id.endsWith("-exit") && node.id !== "device-done")
                expect(
                    deviceEdges.some((edge) => edge.from === node.id),
                    node.id,
                ).toBe(true);
        expect(
            deviceNodes
                .filter((node) => node.id.startsWith("github-"))
                .map((node) => node.id),
        ).toEqual(["github-handoff"]);
        expect(
            journeyOptions({ ...consent, node: "error", signedIn: false }).map(
                (edge) => edge.label,
            ),
        ).toEqual(["Try again"]);
    });
    it.each([
        true,
        false,
    ])("supports manual and complete links with signedIn=%s", (signedIn) => {
        for (const prefilled of [false, true]) {
            let state = settle(
                step(
                    {
                        ...startSelectedJourney({
                            world: "device",
                            section: prefilled ? "link" : "main",
                        }),
                        signedIn,
                    },
                    prefilled ? "Open link with code" : "Open verification URL",
                ),
            );
            if (!signedIn) {
                expect(state.node).toBe("sign-in");
                state = settle(step(state, "Sign in with GitHub"));
                expect(state.node).toBe("github-handoff");
                state = settle(step(state, "Return to Pollinations"));
            }
            expect(state.node).toBe(prefilled ? "consent" : "device-code");
            if (!prefilled)
                state = settle(
                    step({ ...state, deviceCode: "ABCDEFGH" }, "Verify code"),
                );
            expect(state).toMatchObject({
                node: "consent",
                deviceCode: "ABCDEFGH",
                connected: false,
            });
            state = settle(step(state, "Allow access"));
            expect(state).toMatchObject({
                node: "device-result",
                connected: false,
            });
            expect(step(state, "Device retrieves key").connected).toBe(true);
        }
    });
    it("offers only the selected entry and reuses consent and errors", () => {
        const manual = getDeviceFlow("main");
        const linked = getDeviceFlow("link");
        for (const section of ["main", "link"] as const) {
            const state = startSelectedJourney({ world: "device", section });
            expect(
                journeyOptions(state)
                    .filter((edge) => edge.to === "device-session")
                    .map((edge) => edge.label),
            ).toEqual([
                section === "link"
                    ? "Open link with code"
                    : "Open verification URL",
            ]);
            const signIn = getDeviceFlow(section).screens.get("sign-in");
            if (!signIn) throw new Error("Missing device sign-in");
            expect(signIn.variants).toHaveLength(1);
            const url = new URL(canvasScreenUrl(signIn), "http://preview.test");
            expect(url.searchParams.get("user_code")).toBe(
                section === "link" ? "ABCD-EFGH" : "",
            );
        }
        for (const id of [
            "consent",
            "device-submit-session",
            "device-request-expired",
            "device-result",
        ])
            expect(manual.screens.get(id)).toBe(linked.screens.get(id));
    });
    it.each([
        "main",
        "link",
    ] as const)("keeps %s selection through recovery and a new device request", (section) => {
        const initial = {
            ...startSelectedJourney({ world: "device", section }),
            signedIn: true,
        };
        const request = {
            ...initial,
            node: "device-request-expired",
            deviceCode: "OLD-CODE",
            deviceConsentRoute: true,
        };
        const retry = step(request, "Enter another code");
        expect(retry).toMatchObject({
            deviceEntry: section,
            deviceCode: "",
            node: "device-code",
        });
        const recovered = settle(
            step({ ...retry, deviceCode: "NEWCODE1" }, "Verify code"),
        );
        expect(recovered).toMatchObject({
            node: "consent",
            deviceEntry: section,
            deviceCode: "NEWCODE1",
        });
        const expired = settle(step(recovered, "Allow access"), {
            ...defaultJourneySettings,
            deviceSubmitResult: "session",
        });
        const provider = settle(step(expired, "Sign in again"));
        const resumed = settle(step(provider, "Return to Pollinations"));
        expect(resumed).toMatchObject({
            node: "consent",
            deviceCode: "NEWCODE1",
            deviceEntry: section,
        });
        const restarted = step(
            { ...initial, node: "device-stopped" },
            "Start again · new code",
        );
        expect(restarted.deviceEntry).toBe(section);
        const entry = journeyOptions(restarted).find(
            (edge) => edge.to === "device-session",
        );
        if (!entry) throw new Error("Missing device entry");
        expect(
            settle(journeyAdvance(restarted, entry, defaultJourneySettings))
                .node,
        ).toBe(section === "link" ? "consent" : "device-code");
    });
    it.each(
        deviceCodeResults.slice(1),
    )("keeps $id errors at code entry and retries through verification", (result) => {
        const settings: JourneySettings = {
            ...defaultJourneySettings,
            deviceCodeResult: result.id,
        };
        const state = settle(
            step({ ...consent, node: "device-code" }, "Verify code"),
            settings,
        );
        expect(state.node).toBe(`device-code-${result.id}`);
        const recovered = settle(
            step(
                state,
                result.id === "unavailable" ? "Try again" : "Verify code",
            ),
        );
        expect(recovered.node).toBe("consent");
    });
    it.each(
        deviceRequestResults.slice(1),
    )("matches the $id request recovery actions", (result) => {
        const state = settle(
            { ...consent, node: "device-checking" },
            { ...defaultJourneySettings, deviceRequestResult: result.id },
        );
        const expected =
            result.id === "app"
                ? ["Cancel"]
                : result.id === "lookup"
                  ? ["Try again", "Cancel"]
                  : result.id === "unavailable"
                    ? ["Try again"]
                    : ["Enter another code"];
        expect(
            journeyOptions(state)
                .map((edge) => edge.label)
                .sort(),
        ).toEqual(expected.sort());
        if (expected.includes("Try again"))
            expect(settle(step(state, "Try again")).node).toBe("consent");
        if (expected.includes("Enter another code"))
            expect(step(state, "Enter another code")).toMatchObject({
                node: "device-code",
                deviceCode: "",
                consent: null,
            });
    });
    it.each(
        deviceSubmitResults.slice(1),
    )("matches $id failures without claiming approval or denial", (result) => {
        const action = result.id === "deny" ? "Cancel" : "Allow access";
        const settings: JourneySettings = {
            ...defaultJourneySettings,
            deviceSubmitResult: result.id,
        };
        const state = settle(step(consent, action), settings);
        expect(state).toMatchObject({
            node: `device-submit-${result.id}`,
            connected: false,
        });
        const expected =
            result.id === "session"
                ? ["Sign in again"]
                : ["Cancel", "Try again"];
        expect(
            journeyOptions(state)
                .map((edge) => edge.label)
                .sort(),
        ).toEqual(expected.sort());
        if (result.id !== "session") {
            const retry = step(state, "Try again");
            expect(retry.node).toBe("device-checking");
            expect(settle(retry)).toMatchObject({
                node: "consent",
                connected: false,
                deviceCode: state.deviceCode,
                consent: state.consent,
            });
            const denied = settle(step(state, "Cancel"));
            expect(denied).toMatchObject({
                node: "device-declined",
                connected: false,
            });
            expect(step(denied, "Device receives denial").node).toBe(
                "device-stopped",
            );
        }
    });
    it("resets consent after GitHub reauthentication while preserving the exact request route", () => {
        const draft = {
            generationEnabled: false,
            allowedModels: null,
            pollenBudget: 0,
            expiryDays: 2,
            accountPermissions: ["profile"],
        };
        const reviewed = applyJourneyConsent(consent, draft);
        for (const action of ["Allow access", "Cancel"]) {
            const expired = settle(step(reviewed, action), {
                ...defaultJourneySettings,
                deviceSubmitResult: "session",
            });
            expect(expired.signedIn).toBe(false);
            expect(expired.consent).toEqual(draft);
            const handoff = settle(step(expired, "Sign in again"));
            expect(
                devicePreviewOverrides({
                    ...handoff,
                    node: "device-signing-in",
                }).screen,
            ).toBe("device-consent-signed-out");
            const recovered = settle(step(handoff, "Return to Pollinations"));
            expect(recovered).toMatchObject({
                node: "consent",
                deviceCode: "ABCDEFGH",
                deviceConsentRoute: true,
                consent: null,
            });
        }
    });
    it.each([
        "main",
        "link",
    ] as const)("retries callback errors through the original route for %s", (section) => {
        for (const deviceConsentRoute of [false, true]) {
            const failed = step(
                {
                    ...consent,
                    node: "github-handoff",
                    deviceEntry: section,
                    deviceCode:
                        section === "link" || deviceConsentRoute
                            ? "NEWCODE1"
                            : "",
                    deviceConsentRoute,
                    signedIn: false,
                },
                "Return to Pollinations",
                { ...defaultJourneySettings, loginResult: "default" },
            );
            const actions = journeyOptions(failed);
            expect(actions).toHaveLength(1);
            expect(actions[0].to).toBe(
                deviceConsentRoute ? "device-signing-in" : "device-session",
            );
            const retry = settle(step(failed, "Try again"));
            expect(retry.node).toBe(
                deviceConsentRoute ? "github-handoff" : "sign-in",
            );
            expect(retry.deviceCode).toBe(failed.deviceCode);
            expect(retry.deviceConsentRoute).toBe(deviceConsentRoute);
        }
    });
    it("keeps consent if GitHub sign-in cannot start", () => {
        const draft = {
            generationEnabled: false,
            allowedModels: null,
            pollenBudget: 0,
            expiryDays: 2,
            accountPermissions: ["profile"],
        };
        const failed = settle(
            step(
                {
                    ...consent,
                    node: "device-submit-session",
                    consent: draft,
                    signedIn: false,
                },
                "Sign in again",
            ),
            {
                ...defaultJourneySettings,
                loginResult: "start",
            },
        );
        expect(failed).toMatchObject({
            node: "error",
            consent: draft,
            deviceConsentRoute: true,
        });
        expect(settle(step(failed, "Try again"))).toMatchObject({
            node: "github-handoff",
            consent: null,
        });
    });
    it.each(
        Object.entries(loginErrors),
    )("retains the %s callback error and real recovery", (reason, error) => {
        const state = step(
            { ...consent, node: "github-handoff", signedIn: false },
            "Return to Pollinations",
            {
                ...defaultJourneySettings,
                loginResult: reason as keyof typeof loginErrors,
            },
        );
        expect(state).toMatchObject({
            node: error.id,
            signedIn: false,
            connected: false,
        });
        expect(
            journeyOptions(state).some(
                (edge) => edge.label === error.action.label,
            ),
        ).toBe(true);
    });
});
