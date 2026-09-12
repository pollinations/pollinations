import {
    ArrowRightIcon,
    Button,
    Input,
    ScrollArea,
    Surface,
    Switch,
    Tooltip,
    useColorMode,
} from "@pollinations/ui";
import { loginErrors } from "@shared/auth/login-errors.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPollenPackByKey } from "../../shared/pollen-packs";
import {
    appLoginAutomaticDestination,
    appLoginNodes,
    appLoginPreviewScreen,
    appLoginScreens,
    appLoginVariant,
} from "./pollen-connect-app-login";
import {
    authorizeFailures,
    canvasGroups,
    canvasScreenUrl,
    modelCatalogStates,
} from "./pollen-connect-canvas-data";
import { ConsentPreviewControls } from "./pollen-connect-consent-controls";
import {
    deviceAutomaticDestination,
    deviceCodeResults,
    devicePreviewOverrides,
    deviceRequestResults,
    deviceSubmitResults,
    getDeviceFlow,
} from "./pollen-connect-device";
import { type FlowEdge, flowNodes } from "./pollen-connect-diagram";
import {
    AppRequestSelect,
    FlowSelect,
    FlowSwitch,
    PollenPreviewSelect,
} from "./pollen-connect-flow-controls";
import {
    applyJourneyConsent,
    defaultJourneySettings,
    type JourneyLocation,
    type JourneySelection,
    type JourneySettings,
    type JourneyState,
    journeyAdvance,
    journeyFunding,
    journeyOptions,
    restoreJourney,
    startSelectedJourney,
} from "./pollen-connect-journey-state";
import {
    Illustration,
    JourneyPreview,
    ScreenOwnership,
    ScreenWindow,
} from "./pollen-connect-preview";
import type { AppPreviewProps } from "./pollen-connect-request-config";
import type { AuthorizeConsent } from "./src/components/auth/authorize";
import { normalizeDeviceCode } from "./src/lib/device-request";
import "./pollen-connect-journey.css";

const screens = canvasGroups.flatMap((group) => group.screens);
const productActions: Record<string, Record<string, string>> = {
    "github-handoff": { "Return to Pollinations": "loading" },
    "github-signup": {
        "Continue after signup": "github-authorize",
        Cancel: "github-login",
    },
    "app-connect": { "Connect with Pollinations": "loading" },
    "app-connected": {
        "Disconnect app": "app-connect",
    },
    "sign-in": {
        "Sign in with GitHub": "github-session",
        "Continue with GitHub": "github-session",
        Cancel: "cancelled",
        "Back to app": "cancelled",
    },
    consent: {
        "Allow access": "device-result",
        Cancel: "cancelled",
        "Back to app": "cancelled",
    },
    "enter-signed-out": {
        "Sign in": "github-session",
        "Sign in with GitHub": "github-session",
    },
    "enter-connected": {
        "Sign out": "enter-signed-out",
        "API keys": "keys",
        Buy: "account-checkout",
    },
    "account-checkout": {
        Pay: "enter-connected",
        "Check payment": "enter-connected",
        Cancel: "enter-connected",
    },
    keys: {
        Pollen: "enter-connected",
        "Sign out": "enter-signed-out",
        "Add Key": "api-key",
        "Add App": "app-key",
        Edit: "key-edit",
        Delete: "key-delete",
    },
    "api-key": { "Create key": "keys", Cancel: "keys", Close: "keys" },
    "app-key": { "Create key": "keys", Cancel: "keys", Close: "keys" },
    "key-edit": {
        Save: "keys",
        "Save Changes": "keys",
        Cancel: "keys",
        Close: "keys",
    },
    "key-delete": { Delete: "keys", Cancel: "keys", Close: "keys" },
    error: {
        "Try again": "github-session",
        Cancel: "cancelled",
        "Back to app": "cancelled",
    },
    blocked: { Cancel: "app-connect" },
};

export function Journey({
    appPreview,
    onAppPreviewChange,
    desktop,
    entrance,
    onLocationChange,
    onOpenDashboard,
}: {
    desktop: boolean;
    entrance: JourneySelection;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
} & AppPreviewProps) {
    const [state, setState] = useState(() => startSelectedJourney(entrance));
    const [past, setPast] = useState<JourneyState[]>([]);
    const [devicePreview, setDevicePreview] = useState<Record<string, string>>(
        {},
    );
    const selectionKey = `${entrance.world}:${entrance.section}`;
    const appLogin =
        entrance.world === "app" &&
        entrance.section === "main" &&
        state.world === "app";
    // biome-ignore lint/correctness/useExhaustiveDependencies: any changed app request needs a fresh consent draft.
    useEffect(() => {
        if (!appLogin) return;
        setPast([]);
        setState((old) => ({
            ...old,
            consent: null,
            paidOnly: appPreview.request_models === "paid",
        }));
    }, [
        appLogin,
        appPreview.request_scope,
        appPreview.request_models,
        appPreview.request_earnings,
    ]);
    useEffect(() => {
        if (!appLogin) return;
        setState((old) => ({
            ...old,
            paid: Number(appPreview.sim_paid),
            quest: Number(appPreview.sim_quest),
        }));
    }, [appLogin, appPreview.sim_paid, appPreview.sim_quest]);
    useEffect(() => {
        if (!appLogin) return;
        const method = appPreview.protocol === "direct" ? "direct" : "oauth";
        setPast([]);
        setSettings((old) => ({
            ...old,
            appRequestError: "",
            authorizationError: "none",
        }));
        setState((old) =>
            old.method === method
                ? old
                : { ...old, method, node: "app-connect", consent: null },
        );
    }, [appLogin, appPreview.protocol]);
    const selectedSection = useRef(selectionKey);
    const selectedRevision = useRef(entrance.revision);
    const savedSections = useRef(
        new Map<string, { state: JourneyState; past: JourneyState[] }>(),
    );
    const wasSignedIn = useRef(state.signedIn);
    useEffect(() => {
        if (wasSignedIn.current && !state.signedIn) {
            // Invalidate saved protected screens even if the user signs in again
            // before returning to them.
            for (const [section, saved] of savedSections.current) {
                savedSections.current.set(section, {
                    state: restoreJourney(saved.state, state),
                    past: [],
                });
            }
        }
        wasSignedIn.current = state.signedIn;
    }, [state]);
    useEffect(() => {
        onLocationChange({ node: state.node, world: state.world });
    }, [state.node, state.world, onLocationChange]);
    const [settings, setSettings] = useState<JourneySettings>(
        defaultJourneySettings,
    );
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const size = desktop ? "desktop" : "mobile";
    const frame = useRef<HTMLIFrameElement>(null);
    const stateRef = useRef(state);
    const { mode } = useColorMode();
    stateRef.current = state;
    const deviceFlow = getDeviceFlow(state.deviceEntry);
    const node = (
        state.world === "app"
            ? appLoginNodes
            : state.world === "device"
              ? deviceFlow.nodes
              : flowNodes
    ).find((item) => item.id === state.node);
    const entryId =
        {
            blocked: "consent",
            error: "sign-in",
        }[state.node] ?? node?.screen;
    const appEntry =
        state.world === "app" ? appLoginScreens.get(state.node) : undefined;
    const entry =
        appEntry ??
        (state.world === "device"
            ? deviceFlow.screens.get(state.node)
            : undefined) ??
        screens.find((item) => item.id === entryId);
    const variantIndex = appEntry
        ? appLoginVariant(
              appEntry,
              state.node === "app-connection-failed"
                  ? settings.authorizationError
                  : settings.appRequestError,
          )
        : 0;
    const funding = journeyFunding(state);
    const overrides: Record<string, string> = {
        journey: "1",
        theme: mode,
        sim_paid: `${state.paid}`,
        sim_quest: `${state.quest}`,
        sim_budget: `${state.budget}`,
        sim_payment: state.payment,
        sim_pack: `${state.checkoutPack}`,
        sim_usage: state.sharesUsage ? "1" : "0",
        badge: funding?.state ?? "none",
        wallet: funding?.wallet ?? "total",
        app_title: "App example",
        ...(state.world === "app" && !settings.appReturnPage
            ? { origin: "none" }
            : {}),
        request_budget: `${state.budget}`,
        request_models: state.paidOnly ? "paid" : "all",
        ...(appLogin ? appPreview : {}),
        ...(state.world === "device" ? devicePreview : {}),
        protocol: state.method,
        ...(["app", "device"].includes(state.world) &&
        ["consent", "app-checking", "device-checking"].includes(state.node)
            ? { model_catalog: settings.modelCatalog }
            : {}),
        ...(state.consent &&
        [
            "consent",
            "app-connecting",
            "app-connection-failed",
            "app-connected",
            "app-account-error",
        ].includes(state.node)
            ? { consent: JSON.stringify(state.consent) }
            : {}),
    };
    if (state.node === "enter-connected" && past.at(-1)?.signedIn === false)
        overrides.drawer = "open";
    if (state.node === "app-account-error")
        overrides.app_account = "account-error";
    if (state.node === "app-connected" && settings.accountStatus !== "ready")
        overrides.app_account = "loading";
    if (state.node === "app-callback-error" && state.scenario === "key-check")
        overrides.app_callback = "check-error";
    if (state.scenario) overrides.topup_case = state.scenario;
    if (
        state.node === "blocked" &&
        state.world !== "app" &&
        state.world !== "device"
    )
        overrides.request_error = "redirect";
    if (state.node === "error" && state.world !== "app") {
        overrides.action = "sign-in";
        overrides.result = "error";
        if (state.world === "account") overrides.screen = "enter-signed-out";
        else if (state.world === "device")
            overrides.screen = "device-signed-out";
        else if (state.method === "direct")
            overrides.screen = "direct-signed-out";
    }
    if (
        state.node === "sign-in" &&
        state.world !== "device" &&
        state.world !== "app" &&
        state.method === "direct"
    )
        overrides.screen = "direct-signed-out";
    if (
        state.node === "consent" &&
        state.world !== "device" &&
        state.world !== "app" &&
        state.method === "direct"
    )
        overrides.screen = "direct";
    if (state.world === "device")
        Object.assign(overrides, devicePreviewOverrides(state));
    if (appEntry) {
        const screen = appLoginPreviewScreen(
            appEntry,
            variantIndex,
            state.method,
            state.signedIn,
        );
        if (screen) overrides.screen = screen;
    }
    const src =
        entry && !entry.illustration
            ? canvasScreenUrl(entry, variantIndex, overrides)
            : null;

    useEffect(() => {
        const url = new URL(location.href);
        url.searchParams.set("theme", mode);
        history.replaceState({}, "", url);
    }, [mode]);

    const readScreen = useCallback((current: JourneyState) => {
        const doc = frame.current?.contentDocument;
        if (!doc) return current;
        let next = current;
        if (current.node === "enter-connected") {
            const href = doc
                .querySelector<HTMLAnchorElement>(
                    'a[href^="/api/stripe/checkout/"]',
                )
                ?.getAttribute("href");
            const pack =
                href &&
                getPollenPackByKey(
                    new URL(href, location.origin).pathname.split("/").at(-1) ??
                        "",
                );
            if (pack) next = { ...next, checkoutPack: pack.amountUsd };
        }
        if (current.world === "device") {
            const input = doc.querySelector<HTMLInputElement>(
                'input[aria-label="Device code"]',
            );
            if (input)
                next = {
                    ...next,
                    deviceCode: normalizeDeviceCode(input.value),
                };
        }
        if (current.node === "consent") {
            const value = doc.documentElement.dataset.consent;
            if (value)
                next = applyJourneyConsent(
                    next,
                    JSON.parse(value) as AuthorizeConsent,
                );
        }
        return next;
    }, []);

    useEffect(() => {
        if (
            selectedSection.current === selectionKey &&
            selectedRevision.current === entrance.revision
        )
            return;
        const current = readScreen(stateRef.current);
        savedSections.current.set(selectedSection.current, {
            state: current,
            past,
        });
        const saved =
            entrance.world === "account" && entrance.section === "topup"
                ? undefined
                : savedSections.current.get(selectionKey);
        const initial = {
            ...startSelectedJourney(entrance),
            method: current.method,
            paidOnly: current.paidOnly,
            budget: current.budget,
            sharesUsage: current.sharesUsage,
        };
        setState(
            saved
                ? restoreJourney(
                      saved.state,
                      entrance.section === "topup" &&
                          entrance.world === "account"
                          ? { ...current, signedIn: true }
                          : current,
                  )
                : entrance.section === "topup" && entrance.world === "account"
                  ? { ...initial, paid: current.paid, quest: current.quest }
                  : restoreJourney(initial, current),
        );
        setPast(saved?.past ?? []);
        selectedSection.current = selectionKey;
        selectedRevision.current = entrance.revision;
    }, [entrance, selectionKey, past, readScreen]);
    function step(edge: FlowEdge) {
        if (edge.action === "dashboard") {
            onOpenDashboard();
            return;
        }
        const current = readScreen(stateRef.current);
        if (
            current.world !== "device" ||
            !deviceAutomaticDestination(current, settingsRef.current)
        )
            setPast((history) => [...history, current]);
        if (
            (current.node === "github-login" &&
                edge.to === "github-approval") ||
            (current.node === "github-authorize" && edge.to === "loading") ||
            (current.node === "github-signup" && edge.to === "github-authorize")
        )
            setSettings((old) => ({
                ...old,
                githubSignedIn: true,
                githubApproved:
                    current.node === "github-signup"
                        ? false
                        : current.node === "github-authorize" ||
                          old.githubApproved,
            }));
        setState(journeyAdvance(current, edge, settingsRef.current));
    }
    function updateScreen(update: (current: JourneyState) => JourneyState) {
        const current = readScreen(stateRef.current);
        const next = update(current);
        if (next.paidOnly !== current.paidOnly) next.consent = null;
        else if (next.consent && next.budget !== current.budget)
            next.consent = {
                ...next.consent,
                pollenBudget: Number.isFinite(next.budget) ? next.budget : null,
            };
        setState(restoreJourney(next, next));
    }
    const walletContext = ["app", "device", "topup", "account"].includes(
        state.world,
    );
    const githubSignedOutScreen = ["github-login", "github-signup"].includes(
        state.node,
    );
    const githubScreen =
        githubSignedOutScreen || state.node === "github-authorize";
    const walletLocked =
        !walletContext || ["account-checkout"].includes(state.node);
    const switches = [
        {
            group: "Sign-in",
            label: "Signed in to Pollinations",
            checked: state.signedIn,
            disabled: ![
                "app-connect",
                "app-connected",
                "device-start",
                "enter-signed-out",
            ].includes(state.node),
            onChange: (signedIn: boolean) =>
                updateScreen((old) => ({ ...old, signedIn })),
        },
        {
            group: "Sign-in",
            label: "Signed in to GitHub",
            checked: githubScreen
                ? !githubSignedOutScreen
                : settings.githubSignedIn,
            disabled: githubScreen,
            onChange: (githubSignedIn: boolean) =>
                setSettings((old) => ({ ...old, githubSignedIn })),
        },
        {
            group: "Sign-in",
            label: "GitHub access approved",
            checked:
                state.node !== "github-authorize" && settings.githubApproved,
            disabled: githubScreen,
            onChange: (githubApproved: boolean) =>
                setSettings((old) => ({ ...old, githubApproved })),
        },
        {
            group: "App & payment",
            label: "Use OAuth",
            checked: state.method === "oauth",
            disabled: state.world !== "app" || state.node !== "app-connect",
            onChange: (on: boolean) => {
                onAppPreviewChange({ protocol: on ? "oauth" : "direct" });
            },
        },
        {
            group: "App & payment",
            label: "Originating app page known",
            checked: settings.appReturnPage,
            disabled: state.world !== "app",
            onChange: (appReturnPage: boolean) =>
                setSettings((old) => ({ ...old, appReturnPage })),
        },
        {
            group: "App & payment",
            label: "Slow app lookup",
            checked: settings.slowAppLookup,
            disabled: state.world !== "app",
            onChange: (slowAppLookup: boolean) =>
                setSettings((old) => ({ ...old, slowAppLookup })),
        },
        {
            group: "App & payment",
            label: "App requests paid-only models",
            checked: state.paidOnly,
            disabled: !["app", "topup"].includes(state.world),
            onChange: (paidOnly: boolean) =>
                updateScreen((old) => ({ ...old, paidOnly })),
        },
        {
            group: "App & payment",
            label: "Payment confirmed",
            checked: settings.paymentConfirmed,
            disabled:
                !["account-checkout"].includes(state.node) ||
                ["completed", "canceled"].includes(state.payment) ||
                settings.errors,
            onChange: (paymentConfirmed: boolean) =>
                setSettings((old) => ({ ...old, paymentConfirmed })),
        },
    ];
    const errorsDisabled = [
        "keys",
        "key-delete",
        "enter-connected",
        "device-result",
        "device-done",
    ].includes(state.node);
    const stepRef = useRef(step);
    stepRef.current = step;

    function attachScreen() {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        const currentNode = stateRef.current.node;
        if (
            ["app", "device"].includes(stateRef.current.world) &&
            (stateRef.current.world === "device"
                ? deviceAutomaticDestination
                : appLoginAutomaticDestination)(
                stateRef.current,
                settingsRef.current,
            )
        ) {
            const timer = window.setTimeout(() => {
                const current = stateRef.current;
                if (
                    !["app", "device"].includes(current.world) ||
                    current.node !== currentNode
                )
                    return;
                const destination = (
                    current.world === "device"
                        ? deviceAutomaticDestination
                        : appLoginAutomaticDestination
                )(current, settingsRef.current);
                const edge = journeyOptions(current, settingsRef.current).find(
                    (edge) => edge.to === destination && !edge.action,
                );
                if (edge) stepRef.current(edge);
            }, 1400);
            doc.defaultView?.addEventListener(
                "pagehide",
                () => window.clearTimeout(timer),
                { once: true },
            );
        }
        // Ark also observes the parent window. Lab choices are outside the
        // simulated screen, so they must not dismiss its dialogs or menus.
        const keepScreenOpen = (event: Event) => {
            const target = (event as CustomEvent<{ target?: Node }>).detail
                ?.target;
            if (target && target.ownerDocument !== doc) event.preventDefault();
        };
        doc.addEventListener("pointerdown.outside", keepScreenOpen, true);
        doc.addEventListener("focus.outside", keepScreenOpen, true);
        doc.addEventListener(
            "click",
            (event) => {
                const target = (event.target as Element).closest(
                    'button, a, [role="menuitem"]',
                );
                if (
                    !target ||
                    target.hasAttribute("data-preview-action") ||
                    target.getAttribute("disabled") !== null ||
                    target.getAttribute("aria-disabled") === "true"
                )
                    return;
                const current = stateRef.current;
                const label = (
                    target.getAttribute("aria-label") ||
                    target.textContent ||
                    ""
                )
                    .trim()
                    .replace(/\s+/g, " ");
                const edges = journeyOptions(current, settingsRef.current);
                const action = target.getAttribute("data-pollinations-action");
                if (action === "dashboard") {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    onOpenDashboard();
                    return;
                }
                const destination = ["app", "device"].includes(current.world)
                    ? (edges.find((edge) => action && edge.action === action)
                          ?.to ??
                      edges.find((edge) => edge.label === label)?.to ??
                      (label === "Cancel" ||
                      label === "Open dashboard" ||
                      target.getAttribute("title") === "Open dashboard"
                          ? edges.find((edge) => edge.to === "app-home")?.to
                          : undefined))
                    : Object.values(loginErrors).some(
                            (error) => error.id === current.node,
                        )
                      ? edges.find((edge) => edge.label === label)?.to
                      : productActions[current.node]?.[label];
                let edge = destination
                    ? edges.find((item) => item.to === destination)
                    : undefined;
                if (current.node === "account-checkout" && destination) {
                    const outcome =
                        label === "Cancel"
                            ? "Canceled · balance unchanged"
                            : settingsRef.current.errors
                              ? "Payment failed · retry"
                              : settingsRef.current.paymentConfirmed
                                ? "Payment confirmed"
                                : "Payment pending";
                    edge = edges.find((item) => item.label === outcome);
                }
                if (
                    edge &&
                    label !== "Cancel" &&
                    ["consent", "api-key", "app-key", "key-edit"].includes(
                        current.node,
                    ) &&
                    !["app", "device"].includes(current.world) &&
                    settingsRef.current.errors &&
                    label !== "Close"
                )
                    return;
                if (!edge && target.tagName === "A") {
                    const href = target.getAttribute("href") ?? "";
                    if (
                        current.node === "consent" &&
                        new URL(href, location.href).origin ===
                            location.origin &&
                        new URL(href, location.href).pathname === "/"
                    )
                        edge = edges.find(
                            (item) => item.to === "enter-connected",
                        );
                    if (href.includes("/keys"))
                        edge = edges.find((item) => item.to === "keys");
                    if (
                        !edge &&
                        (href.includes("/pollen") ||
                            target.getAttribute("title") === "Open dashboard" ||
                            label.includes("dashboard"))
                    )
                        edge = edges.find(
                            (item) => item.to === "enter-connected",
                        );
                }
                if (edge) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    stepRef.current(edge);
                } else if (target.tagName === "A") {
                    // Let the real sidebar close when choosing its current page.
                    const href = target.getAttribute("href");
                    if (href === "https://pollinations.ai/refunds") return;
                    if (
                        current.signedIn &&
                        ((current.node === "enter-connected" &&
                            href === "/pollen") ||
                            (current.node === "keys" && href === "/keys"))
                    )
                        return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            true,
        );
        doc.addEventListener(
            "submit",
            (event) => {
                event.preventDefault();
                const current = stateRef.current;
                if (
                    current.world !== "device" ||
                    (event.target as HTMLFormElement).id !== "device-code-form"
                )
                    return;
                const button = doc.querySelector<HTMLButtonElement>(
                    'button[form="device-code-form"]',
                );
                if (!button || button.disabled) return;
                const edge = journeyOptions(current).find(
                    (edge) => edge.to === "device-verifying",
                );
                if (edge) {
                    event.stopImmediatePropagation();
                    stepRef.current(edge);
                }
            },
            true,
        );
    }

    const title = entry?.title ?? node?.label ?? "Choose a path";
    return (
        <div
            className="journey-view"
            data-theme="accent"
            data-preview-size={size}
        >
            <ScrollArea className="journey-shell">
                <main className="journey-layout">
                    <section
                        className="journey-preview"
                        aria-label="Screen preview"
                    >
                        {entry && (appLogin || state.world === "device") && (
                            <div className="journey-screen-caption">
                                <strong>{title}</strong>
                                <ScreenOwnership entry={entry} />
                            </div>
                        )}
                        <JourneyPreview desktop={desktop} framed={!!entry}>
                            {!entry && node?.kind === "outcome" && (
                                <Surface
                                    variant="panel"
                                    className="polli:p-6 polli:text-center"
                                >
                                    <p className="font-semibold">
                                        {node.label}
                                    </p>
                                    <p className="mt-2 text-sm">{node.note}</p>
                                    <p className="mt-3 text-xs opacity-60">
                                        This action leaves the connection flow.
                                    </p>
                                </Surface>
                            )}
                            {entry && (
                                <ScreenWindow entry={entry}>
                                    {src ? (
                                        <iframe
                                            ref={frame}
                                            src={src}
                                            title={title}
                                            key={state.node}
                                            onLoad={attachScreen}
                                            sandbox="allow-scripts allow-same-origin allow-forms"
                                        />
                                    ) : entry?.illustration ? (
                                        <Illustration
                                            name={entry.illustration}
                                            onAction={(label) => {
                                                if (state.world === "device") {
                                                    const edge = journeyOptions(
                                                        state,
                                                    ).find(
                                                        (edge) =>
                                                            edge.label ===
                                                            label,
                                                    );
                                                    if (edge) step(edge);
                                                    return;
                                                }
                                                const target =
                                                    productActions[
                                                        state.node
                                                    ]?.[label] ??
                                                    (label ===
                                                    "Create an account"
                                                        ? "github-signup"
                                                        : label === "Cancel"
                                                          ? state.world ===
                                                            "app"
                                                              ? "login-failed"
                                                              : "error"
                                                          : {
                                                                "github-login":
                                                                    "github-approval",
                                                                "github-signup":
                                                                    "github-authorize",
                                                                "github-authorize":
                                                                    "loading",
                                                            }[state.node]);
                                                const edge = journeyOptions(
                                                    state,
                                                ).find(
                                                    (edge) =>
                                                        edge.to === target,
                                                );
                                                if (edge) step(edge);
                                            }}
                                        />
                                    ) : null}
                                </ScreenWindow>
                            )}
                        </JourneyPreview>
                    </section>
                    <ScrollArea className="journey-controls">
                        <aside
                            className="journey-switches"
                            aria-label="Journey controls"
                        >
                            {state.world === "device" &&
                                [
                                    "device-start",
                                    "device-result",
                                    "device-declined",
                                    "device-stopped",
                                    "device-home",
                                ].includes(state.node) && (
                                    <Surface
                                        variant="panel"
                                        className="polli:p-4"
                                    >
                                        <fieldset className="journey-switch-group">
                                            <legend>Outside the browser</legend>
                                            {journeyOptions(state)
                                                .filter(
                                                    (edge) =>
                                                        state.node !==
                                                            "device-start" ||
                                                        edge.to ===
                                                            "device-stopped",
                                                )
                                                .map((edge) => (
                                                    <Button
                                                        key={edge.label}
                                                        data-theme="neutral"
                                                        onClick={() =>
                                                            step(edge)
                                                        }
                                                    >
                                                        {edge.label}
                                                    </Button>
                                                ))}
                                        </fieldset>
                                    </Surface>
                                )}
                            {(entrance.section === "topup"
                                ? ["App & payment", "Pollen"]
                                : ["Sign-in", "App & payment", "Pollen"]
                            ).map((group) => (
                                <div
                                    key={group}
                                    className="journey-parameter-column"
                                >
                                    <Surface
                                        variant="panel"
                                        className="polli:p-4"
                                    >
                                        <fieldset className="journey-switch-group">
                                            <legend>
                                                {group === "App & payment" &&
                                                state.world === "device"
                                                    ? "Device request"
                                                    : appLogin &&
                                                        group ===
                                                            "App & payment"
                                                      ? "App"
                                                      : group}
                                            </legend>
                                            {group === "Sign-in" && (
                                                <label className="journey-switch-row">
                                                    <span>
                                                        Enter login result
                                                    </span>
                                                    <select
                                                        aria-label="Enter login result"
                                                        value={
                                                            settings.loginResult
                                                        }
                                                        onChange={(event) =>
                                                            setSettings(
                                                                (previous) => ({
                                                                    ...previous,
                                                                    loginResult:
                                                                        event
                                                                            .target
                                                                            .value as JourneySettings["loginResult"],
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        <option value="ready">
                                                            Account ready
                                                        </option>
                                                        {(appLogin ||
                                                            state.world ===
                                                                "device") && (
                                                            <option value="start">
                                                                Cannot start
                                                                sign-in
                                                            </option>
                                                        )}
                                                        {Object.entries(
                                                            loginErrors,
                                                        ).map(
                                                            ([code, error]) => (
                                                                <option
                                                                    key={code}
                                                                    value={code}
                                                                >
                                                                    {
                                                                        error.title
                                                                    }
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>
                                            )}
                                            {group === "App & payment" &&
                                                state.world === "device" && (
                                                    <ConsentPreviewControls
                                                        device
                                                        values={devicePreview}
                                                        showPollen={false}
                                                        onChange={(patch) => {
                                                            setDevicePreview(
                                                                (old) => ({
                                                                    ...old,
                                                                    ...patch,
                                                                }),
                                                            );
                                                            setPast([]);
                                                            setState((old) => ({
                                                                ...old,
                                                                consent: null,
                                                            }));
                                                        }}
                                                    />
                                                )}
                                            {group === "App & payment" &&
                                                ["app", "device"].includes(
                                                    state.world,
                                                ) && (
                                                    <FlowSelect
                                                        label="Model catalogue"
                                                        value={
                                                            settings.modelCatalog
                                                        }
                                                        options={
                                                            modelCatalogStates
                                                        }
                                                        onChange={(
                                                            modelCatalog,
                                                        ) => {
                                                            setState(
                                                                readScreen(
                                                                    stateRef.current,
                                                                ),
                                                            );
                                                            setSettings(
                                                                (old) => ({
                                                                    ...old,
                                                                    modelCatalog:
                                                                        modelCatalog as JourneySettings["modelCatalog"],
                                                                }),
                                                            );
                                                        }}
                                                    />
                                                )}
                                            {group === "App & payment" &&
                                                state.world === "device" &&
                                                (
                                                    [
                                                        [
                                                            "Code verification",
                                                            "deviceCodeResult",
                                                            deviceCodeResults,
                                                        ],
                                                        [
                                                            "Request verification",
                                                            "deviceRequestResult",
                                                            deviceRequestResults,
                                                        ],
                                                        [
                                                            "Approval / decline",
                                                            "deviceSubmitResult",
                                                            deviceSubmitResults,
                                                        ],
                                                    ] as const
                                                ).map(
                                                    ([label, key, options]) => (
                                                        <FlowSelect
                                                            key={key}
                                                            label={label}
                                                            value={
                                                                settings[key]
                                                            }
                                                            options={options}
                                                            onChange={(value) =>
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        [key]: value,
                                                                    }),
                                                                )
                                                            }
                                                        />
                                                    ),
                                                )}
                                            {group === "App & payment" &&
                                                state.world === "app" && (
                                                    <>
                                                        {appLogin && (
                                                            <ConsentPreviewControls
                                                                values={
                                                                    appPreview
                                                                }
                                                                showPollen={
                                                                    false
                                                                }
                                                                onChange={
                                                                    onAppPreviewChange
                                                                }
                                                            />
                                                        )}
                                                        <AppRequestSelect
                                                            value={
                                                                settings.appRequestError
                                                            }
                                                            oauth={
                                                                state.method ===
                                                                "oauth"
                                                            }
                                                            onChange={(
                                                                appRequestError,
                                                            ) => {
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        appRequestError,
                                                                    }),
                                                                );
                                                                if (
                                                                    !appRequestError &&
                                                                    state.node ===
                                                                        "blocked"
                                                                )
                                                                    setState(
                                                                        (
                                                                            old,
                                                                        ) => ({
                                                                            ...old,
                                                                            node: old.signedIn
                                                                                ? "app-checking"
                                                                                : "app-sign-in-checking",
                                                                        }),
                                                                    );
                                                            }}
                                                        />
                                                        <FlowSelect
                                                            label="Authorization result"
                                                            value={
                                                                settings.authorizationError
                                                            }
                                                            options={[
                                                                {
                                                                    id: "none",
                                                                    label: "Access granted",
                                                                },
                                                                ...authorizeFailures.filter(
                                                                    ({ id }) =>
                                                                        state.method ===
                                                                            "oauth" ||
                                                                        id !==
                                                                            "code",
                                                                ),
                                                            ]}
                                                            onChange={(
                                                                authorizationError,
                                                            ) => {
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        authorizationError:
                                                                            authorizationError as JourneySettings["authorizationError"],
                                                                    }),
                                                                );
                                                                if (
                                                                    authorizationError ===
                                                                        "none" &&
                                                                    state.node ===
                                                                        "app-connection-failed"
                                                                )
                                                                    setState(
                                                                        (
                                                                            old,
                                                                        ) => ({
                                                                            ...old,
                                                                            node: "consent",
                                                                        }),
                                                                    );
                                                            }}
                                                        />
                                                    </>
                                                )}
                                            {group === "App & payment" &&
                                                state.world === "app" &&
                                                state.method === "oauth" && (
                                                    <label className="journey-switch-row">
                                                        <span>
                                                            SDK connection
                                                        </span>
                                                        <select
                                                            aria-label="SDK connection"
                                                            value={
                                                                settings.appConnectionError
                                                            }
                                                            onChange={(event) =>
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        appConnectionError:
                                                                            event
                                                                                .target
                                                                                .value as JourneySettings["appConnectionError"],
                                                                    }),
                                                                )
                                                            }
                                                        >
                                                            <option value="none">
                                                                Connects
                                                                successfully
                                                            </option>
                                                            <option value="start">
                                                                Cannot start
                                                                authorization
                                                            </option>
                                                            <option value="callback">
                                                                Callback or
                                                                token exchange
                                                                fails
                                                            </option>
                                                        </select>
                                                    </label>
                                                )}
                                            {group === "App & payment" &&
                                                state.world === "app" && (
                                                    <FlowSelect
                                                        label="Account response"
                                                        value={
                                                            settings.accountStatus
                                                        }
                                                        options={[
                                                            {
                                                                id: "ready",
                                                                label: "Available",
                                                            },
                                                            {
                                                                id: "unavailable",
                                                                label: "Temporarily unavailable",
                                                            },
                                                            {
                                                                id: "unauthorized",
                                                                label: "Key expired or revoked",
                                                            },
                                                        ]}
                                                        onChange={(
                                                            accountStatus,
                                                        ) =>
                                                            setSettings(
                                                                (current) => ({
                                                                    ...current,
                                                                    accountStatus:
                                                                        accountStatus as JourneySettings["accountStatus"],
                                                                }),
                                                            )
                                                        }
                                                    />
                                                )}
                                            {group === "App & payment" &&
                                                state.world === "app" && (
                                                    <label className="journey-switch-row">
                                                        <span>
                                                            Stored app key
                                                        </span>
                                                        <select
                                                            aria-label="Stored app key"
                                                            value={
                                                                !state.connected &&
                                                                state.scenario !==
                                                                    "key-check"
                                                                    ? "none"
                                                                    : settings.storedKeyStatus
                                                            }
                                                            disabled={
                                                                state.node !==
                                                                    "app-connect" &&
                                                                state.scenario !==
                                                                    "key-check"
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) => {
                                                                const value =
                                                                    event.target
                                                                        .value;
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        storedKeyStatus:
                                                                            value ===
                                                                            "none"
                                                                                ? "valid"
                                                                                : (value as JourneySettings["storedKeyStatus"]),
                                                                    }),
                                                                );
                                                                if (
                                                                    state.node ===
                                                                    "app-connect"
                                                                )
                                                                    setState(
                                                                        (
                                                                            old,
                                                                        ) => ({
                                                                            ...old,
                                                                            connected:
                                                                                value !==
                                                                                "none",
                                                                            node:
                                                                                value ===
                                                                                "none"
                                                                                    ? "app-connect"
                                                                                    : "app-callback",
                                                                        }),
                                                                    );
                                                            }}
                                                        >
                                                            <option
                                                                value="none"
                                                                disabled={
                                                                    state.scenario ===
                                                                    "key-check"
                                                                }
                                                            >
                                                                No stored key
                                                            </option>
                                                            <option value="valid">
                                                                Valid
                                                            </option>
                                                            <option value="invalid">
                                                                Expired or
                                                                revoked
                                                            </option>
                                                            <option value="unavailable">
                                                                Check
                                                                unavailable
                                                            </option>
                                                        </select>
                                                    </label>
                                                )}
                                            {group === "Pollen" && appLogin && (
                                                <>
                                                    <PollenPreviewSelect
                                                        paid={state.paid}
                                                        quest={state.quest}
                                                        disabled={walletLocked}
                                                        onChange={({
                                                            paid,
                                                            quest,
                                                        }) =>
                                                            onAppPreviewChange({
                                                                sim_paid:
                                                                    String(
                                                                        paid,
                                                                    ),
                                                                sim_quest:
                                                                    String(
                                                                        quest,
                                                                    ),
                                                            })
                                                        }
                                                    />
                                                    {state.node ===
                                                        "app-connected" && (
                                                        <FlowSelect
                                                            label="App allowance"
                                                            value={
                                                                !Number.isFinite(
                                                                    state.budget,
                                                                )
                                                                    ? "unlimited"
                                                                    : state.budget >
                                                                        0
                                                                      ? "available"
                                                                      : "used"
                                                            }
                                                            options={[
                                                                {
                                                                    id: "available",
                                                                    label: "Available",
                                                                },
                                                                {
                                                                    id: "used",
                                                                    label: "Used up",
                                                                },
                                                                {
                                                                    id: "unlimited",
                                                                    label: "Unlimited",
                                                                },
                                                            ]}
                                                            disabled={
                                                                state.payment ===
                                                                "pending"
                                                            }
                                                            onChange={(value) =>
                                                                updateScreen(
                                                                    (old) => ({
                                                                        ...old,
                                                                        budget:
                                                                            value ===
                                                                            "unlimited"
                                                                                ? Infinity
                                                                                : value ===
                                                                                    "available"
                                                                                  ? 5
                                                                                  : 0,
                                                                    }),
                                                                )
                                                            }
                                                        />
                                                    )}
                                                </>
                                            )}
                                            {group === "Pollen" &&
                                                !appLogin &&
                                                (
                                                    [
                                                        [
                                                            "paid",
                                                            "Paid Pollen",
                                                            walletLocked,
                                                        ],
                                                        [
                                                            "quest",
                                                            "Quest Pollen",
                                                            walletLocked,
                                                        ],
                                                        [
                                                            "budget",
                                                            "App allowance",
                                                            state.node !==
                                                                "app-connected" ||
                                                                !Number.isFinite(
                                                                    state.budget,
                                                                ) ||
                                                                state.payment ===
                                                                    "pending",
                                                        ],
                                                    ] as const
                                                ).map(
                                                    ([
                                                        bucket,
                                                        label,
                                                        disabled,
                                                    ]) => (
                                                        <label
                                                            key={bucket}
                                                            htmlFor={`journey-balance-${bucket}`}
                                                            className="journey-switch-row"
                                                            data-disabled={
                                                                disabled ||
                                                                undefined
                                                            }
                                                        >
                                                            <span>{label}</span>
                                                            <Input
                                                                id={`journey-balance-${bucket}`}
                                                                type="number"
                                                                aria-label={
                                                                    label
                                                                }
                                                                min={0}
                                                                step={1}
                                                                inputMode="numeric"
                                                                className="polli:w-20 polli:shrink-0 polli:text-right"
                                                                value={
                                                                    Number.isFinite(
                                                                        state[
                                                                            bucket
                                                                        ],
                                                                    )
                                                                        ? state[
                                                                              bucket
                                                                          ]
                                                                        : ""
                                                                }
                                                                placeholder="∞"
                                                                disabled={
                                                                    disabled
                                                                }
                                                                onChange={(
                                                                    event,
                                                                ) => {
                                                                    const value =
                                                                        event
                                                                            .currentTarget
                                                                            .valueAsNumber;
                                                                    if (
                                                                        Number.isFinite(
                                                                            value,
                                                                        )
                                                                    )
                                                                        updateScreen(
                                                                            (
                                                                                old,
                                                                            ) => ({
                                                                                ...old,
                                                                                [bucket]:
                                                                                    Math.max(
                                                                                        0,
                                                                                        Math.trunc(
                                                                                            value,
                                                                                        ),
                                                                                    ),
                                                                            }),
                                                                        );
                                                                }}
                                                            />
                                                        </label>
                                                    ),
                                                )}
                                            {switches
                                                .filter(
                                                    (item) =>
                                                        item.group === group &&
                                                        (state.world !==
                                                            "device" ||
                                                            item.label ===
                                                                "Signed in to Pollinations") &&
                                                        !(
                                                            state.world ===
                                                                "app" &&
                                                            [
                                                                "Signed in to GitHub",
                                                                "GitHub access approved",
                                                                "App requests paid-only models",
                                                            ].includes(
                                                                item.label,
                                                            )
                                                        ) &&
                                                        !(
                                                            appLogin &&
                                                            [
                                                                "Admin access",
                                                                "Payment confirmed",
                                                            ].includes(
                                                                item.label,
                                                            )
                                                        ),
                                                )
                                                .map((item) => (
                                                    <FlowSwitch
                                                        key={item.label}
                                                        label={item.label}
                                                        checked={item.checked}
                                                        disabled={item.disabled}
                                                        onChange={item.onChange}
                                                    />
                                                ))}
                                        </fieldset>
                                    </Surface>
                                    {group === "Pollen" &&
                                        !appLogin &&
                                        state.world !== "device" && (
                                            <Surface
                                                variant="card-themed"
                                                className="journey-error-card"
                                            >
                                                {" "}
                                                <div
                                                    className="journey-switch-row"
                                                    data-disabled={
                                                        errorsDisabled ||
                                                        undefined
                                                    }
                                                >
                                                    <span>Request fails</span>
                                                    <Switch
                                                        ariaLabel="Request fails"
                                                        checked={
                                                            settings.errors
                                                        }
                                                        disabled={
                                                            errorsDisabled
                                                        }
                                                        status={
                                                            settings.errors
                                                                ? "invalid"
                                                                : undefined
                                                        }
                                                        onChange={(errors) => {
                                                            setSettings(
                                                                (old) => ({
                                                                    ...old,
                                                                    errors,
                                                                }),
                                                            );
                                                            if (!errors)
                                                                setState(
                                                                    (old) => ({
                                                                        ...old,
                                                                        scenario:
                                                                            "",
                                                                        notice: "",
                                                                    }),
                                                                );
                                                        }}
                                                    />
                                                </div>
                                            </Surface>
                                        )}
                                </div>
                            ))}
                        </aside>
                    </ScrollArea>
                </main>
            </ScrollArea>
            <div className="journey-back-tools">
                <Tooltip content="Previous step" triggerAs="span">
                    <Button
                        data-theme="neutral"
                        aria-label="Previous step"
                        className="polli:gap-2"
                        disabled={!past.length}
                        onClick={() => {
                            const previous = past.at(-1);
                            if (previous) {
                                setState(
                                    restoreJourney(previous, stateRef.current),
                                );
                                setPast(past.slice(0, -1));
                            }
                        }}
                    >
                        <ArrowRightIcon className="polli:h-4 polli:w-4 polli:rotate-180" />
                        <span className="journey-back-label">
                            Previous step
                        </span>
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}
