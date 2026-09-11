import { Button, Input, Surface, Switch, useColorMode } from "@pollinations/ui";
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
import { Illustration, ScreenWindow } from "./pollen-connect-preview";
import type { AuthorizeConsent } from "./src/components/auth/authorize";
import { loginErrors } from "./src/lib/login-errors";
import "./pollen-connect-journey.css";

import { addPollenAmounts } from "./pollen-connect-add-pollen-data";

const screens = canvasGroups.flatMap((group) => group.screens);
const productActions: Record<string, Record<string, string>> = {
    "github-handoff": { "Return to Pollinations": "loading" },
    "github-signup": {
        "Continue after signup": "github-authorize",
        Cancel: "github-login",
    },
    "app-connect": { "Connect with Pollinations": "loading" },
    "app-connected": {
        "Add Pollen": "add-pollen-amount",
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
    "add-pollen-amount": {
        "Save budget": "add-pollen-covered",
        Buy: "add-pollen-checkout",
        Cancel: "add-pollen-unchanged",
    },
    "add-pollen-checkout": {
        Pay: "add-pollen-pending",
        Cancel: "add-pollen-unchanged",
    },
    "add-pollen-pending": {
        "Back to app": "app-connected",
        "Check top-up": "add-pollen-pending",
    },
    "device-code": { Continue: "code-valid" },
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
    "api-key": { Create: "keys", Cancel: "keys", Close: "keys" },
    "app-key": { Create: "keys", Cancel: "keys", Close: "keys" },
    "key-edit": {
        Save: "keys",
        "Save Changes": "keys",
        Cancel: "keys",
        Close: "keys",
    },
    "key-delete": { Delete: "keys", Cancel: "keys", Close: "keys" },
    "dashboard-sign-in": { "Sign in with Pollinations": "identity" },
    identity: {
        "Continue with GitHub": "github-session",
        "Sign in with GitHub": "github-session",
    },
    "dashboard-connected": {
        "Sign out": "dashboard-sign-in",
        Dashboard: "enter-connected",
    },
    error: {
        "Try again": "github-session",
        Cancel: "cancelled",
        "Back to app": "cancelled",
    },
    blocked: { Cancel: "app-connect" },
    "dashboard-denied": { "Sign in with Pollinations": "identity" },
    "add-pollen-failed": { Cancel: "add-pollen-unchanged" },
};

export function Journey({
    desktop,
    entrance,
    onLocationChange,
}: {
    desktop: boolean;
    entrance: JourneySelection;
    onLocationChange: (location: JourneyLocation) => void;
}) {
    const [state, setState] = useState(() => startSelectedJourney(entrance));
    const [past, setPast] = useState<JourneyState[]>([]);
    const selectionKey = `${entrance.world}:${entrance.section}`;
    const appLogin =
        entrance.world === "app" &&
        entrance.section === "main" &&
        state.world === "app";
    const selectedSection = useRef(selectionKey);
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
    const [scale, setScale] = useState(1);
    const frame = useRef<HTMLIFrameElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const stateRef = useRef(state);
    const { mode } = useColorMode();
    stateRef.current = state;
    const node = (state.world === "app" ? appLoginNodes : flowNodes).find(
        (item) => item.id === state.node,
    );
    const entryId =
        {
            blocked: "consent",
            error: "sign-in",
            "dashboard-denied": "dashboard-sign-in",
            "add-pollen-failed": "add-pollen-amount",
        }[state.node] ?? node?.screen;
    const appEntry =
        state.world === "app" ? appLoginScreens.get(state.node) : undefined;
    const entry = appEntry ?? screens.find((item) => item.id === entryId);
    const variantIndex = appEntry
        ? appLoginVariant(
              appEntry,
              state.node === "app-connection-failed"
                  ? settings.authorizationError
                  : settings.appRequestError,
          )
        : 0;
    const funding = journeyFunding(state);
    const width = size === "mobile" ? 375 : 1280;
    const height = size === "mobile" ? (375 * 2622) / 1206 : 800;
    const overrides: Record<string, string> = {
        journey: "1",
        theme: mode,
        sim_paid: `${state.paid}`,
        sim_quest: `${state.quest}`,
        sim_budget: `${state.budget}`,
        sim_amount: `${state.amount}`,
        sim_payment: state.payment,
        sim_purchased: `${state.purchased}`,
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
        ...(state.world === "app" &&
        ["consent", "app-checking"].includes(state.node)
            ? { model_catalog: settings.modelCatalog }
            : {}),
        ...(state.consent &&
        ["consent", "app-connecting", "app-connection-failed"].includes(
            state.node,
        )
            ? { consent: JSON.stringify(state.consent) }
            : {}),
    };
    if (state.node === "enter-connected" && past.at(-1)?.signedIn === false)
        overrides.drawer = "open";
    if (state.node === "app-account-error")
        overrides.app_account = "account-error";
    if (state.node === "app-callback-error" && state.scenario === "key-check")
        overrides.app_callback = "check-error";
    if (state.scenario) overrides.topup_case = state.scenario;
    if (state.node === "blocked" && state.world !== "app")
        overrides.request_error = "redirect";
    if (state.node === "dashboard-denied") {
        overrides.screen = "dashboard-error";
        overrides.app = "observability";
        overrides.auth_error = "admin_required";
    }
    if (state.node === "error" && state.world !== "app") {
        overrides.action = "sign-in";
        overrides.result = "error";
        if (state.world === "admin") overrides.screen = "identity";
        else if (state.world === "account")
            overrides.screen = "enter-signed-out";
        else if (state.world === "device")
            overrides.screen = "device-signed-out";
        else if (state.method === "direct")
            overrides.screen = "direct-signed-out";
    }
    if (state.node === "add-pollen-failed")
        overrides.topup_case = "sign-in-error";
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
    if (state.node === "sign-in" && state.world === "device")
        overrides.screen = "device-signed-out";
    if (state.node === "consent" && state.world === "device")
        overrides.screen = "device-consent";
    if (state.node === "device-code" && state.scenario)
        overrides.screen = state.scenario;
    if (state.node === "device-result")
        overrides.outcome = state.denied ? "denied" : "authorized";
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
    useEffect(() => {
        const element = stage.current;
        if (!element) return;
        const observer = new ResizeObserver(([record]) => {
            setScale(
                Math.max(
                    0.1,
                    Math.min(
                        1,
                        (record.contentRect.width - 24) / width,
                        (record.contentRect.height - 24) / height,
                    ),
                ),
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [width, height]);

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
        if (current.node === "add-pollen-amount") {
            const allowance = Number(
                doc
                    .querySelector('[aria-label="New allowance"]')
                    ?.getAttribute("aria-valuetext")
                    ?.split(" ")[0],
            );
            const amount = allowance - current.budget;
            if (
                Number.isFinite(allowance) &&
                allowance >= 0 &&
                allowance <=
                    Math.ceil(current.budget + Math.max(...addPollenAmounts))
            )
                next = { ...next, amount };
            const selectedPack = Number(
                doc.querySelector<HTMLInputElement>(
                    'input[name="pollen-purchase-pack"]',
                )?.value,
            );
            next = {
                ...next,
                checkoutPack: Number.isFinite(selectedPack) ? selectedPack : 0,
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
        if (selectedSection.current === selectionKey) return;
        const current = readScreen(stateRef.current);
        savedSections.current.set(selectedSection.current, {
            state: current,
            past,
        });
        const saved = savedSections.current.get(selectionKey);
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
    }, [entrance, selectionKey, past, readScreen]);
    function step(edge: FlowEdge) {
        const current = readScreen(stateRef.current);
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
        !walletContext ||
        [
            "add-pollen-checkout",
            "add-pollen-pending",
            "account-checkout",
        ].includes(state.node);
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
                "dashboard-sign-in",
                "identity",
                "add-pollen-amount",
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
            group: "Sign-in",
            label: "Admin access",
            checked: settings.adminAccess,
            disabled:
                state.world !== "admin" ||
                ["dashboard-connected", "dashboard-denied"].includes(
                    state.node,
                ),
            onChange: (adminAccess: boolean) =>
                setSettings((old) => ({ ...old, adminAccess })),
        },
        {
            group: "App & payment",
            label: "Use OAuth",
            checked: state.method === "oauth",
            disabled: state.world !== "app" || state.node !== "app-connect",
            onChange: (on: boolean) => {
                setSettings((old) => ({
                    ...old,
                    appRequestError: "",
                    authorizationError: "none",
                }));
                updateScreen((old) => ({
                    ...old,
                    method: on ? "oauth" : "direct",
                }));
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
            disabled: !["app", "device", "topup"].includes(state.world),
            onChange: (paidOnly: boolean) =>
                updateScreen((old) => ({ ...old, paidOnly })),
        },
        {
            group: "App & payment",
            label: "Payment confirmed",
            checked: settings.paymentConfirmed,
            disabled:
                ![
                    "add-pollen-checkout",
                    "add-pollen-pending",
                    "account-checkout",
                ].includes(state.node) ||
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
        "dashboard-connected",
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
            stateRef.current.world === "app" &&
            appLoginAutomaticDestination(stateRef.current, settingsRef.current)
        ) {
            const timer = window.setTimeout(() => {
                const current = stateRef.current;
                if (current.world !== "app" || current.node !== currentNode)
                    return;
                const destination = appLoginAutomaticDestination(
                    current,
                    settingsRef.current,
                );
                const edge = journeyOptions(current, settingsRef.current).find(
                    (edge) => edge.to === destination,
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
        doc.addEventListener("connect-lab-close", () => {
            const current = stateRef.current;
            const destination =
                current.node === "add-pollen-pending"
                    ? "app-connected"
                    : "add-pollen-unchanged";
            const edge = journeyOptions(current, settingsRef.current).find(
                (edge) => edge.to === destination,
            );
            if (edge) stepRef.current(edge);
        });
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
                const destination =
                    current.world === "app"
                        ? (edges.find((edge) => edge.label === label)?.to ??
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
                    current.node === "add-pollen-checkout" &&
                    label === "Cancel"
                )
                    edge = edges.find((item) =>
                        item.label.includes("canceled"),
                    );
                if (edge && label !== "Cancel") {
                    const currentSettings = settingsRef.current;
                    if (
                        current.node === "add-pollen-checkout" &&
                        label === "Pay"
                    )
                        edge = edges.find(
                            (item) =>
                                item.to ===
                                (currentSettings.paymentConfirmed &&
                                !currentSettings.errors
                                    ? "add-pollen-credited"
                                    : "add-pollen-pending"),
                        );
                    if (
                        current.node === "add-pollen-pending" &&
                        label === "Check top-up"
                    )
                        edge = edges.find(
                            (item) =>
                                item.to ===
                                (currentSettings.paymentConfirmed &&
                                !currentSettings.errors
                                    ? "add-pollen-credited"
                                    : "add-pollen-pending"),
                        );
                    if (
                        ["consent", "api-key", "app-key", "key-edit"].includes(
                            current.node,
                        ) &&
                        current.world !== "app" &&
                        currentSettings.errors &&
                        label !== "Close"
                    )
                        return;
                    if (
                        ["add-pollen-amount", "add-pollen-checkout"].includes(
                            current.node,
                        ) &&
                        currentSettings.errors
                    )
                        edge = edges.find((item) => item.to === current.node);
                    if (
                        current.node === "add-pollen-amount" &&
                        !current.signedIn
                    )
                        edge = edges.find(
                            (item) => item.to === "github-session",
                        );
                }
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
                    if (
                        href.includes("/pollen#buy-pollen") &&
                        current.node === "app-connected"
                    )
                        edge = edges.find(
                            (item) => item.to === "add-pollen-amount",
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
        doc.addEventListener("submit", (event) => event.preventDefault(), true);
    }

    const title = entry?.title ?? node?.label ?? "Choose a path";
    return (
        <div
            className="journey-view"
            data-theme="accent"
            data-preview-size={size}
        >
            <div className="journey-shell">
                <main className="journey-layout">
                    <section
                        className="journey-preview"
                        aria-label="Screen preview"
                    >
                        <div className="journey-stage" ref={stage}>
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
                                <div
                                    className={`journey-device journey-device-${size}`}
                                    style={{
                                        width: width * scale,
                                        height: height * scale,
                                    }}
                                >
                                    <div
                                        className="journey-screen"
                                        style={{
                                            width,
                                            height,
                                            transform: `scale(${scale})`,
                                        }}
                                    >
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
                                                        const target =
                                                            productActions[
                                                                state.node
                                                            ]?.[label] ??
                                                            (label ===
                                                            "Create an account"
                                                                ? "github-signup"
                                                                : label ===
                                                                    "Cancel"
                                                                  ? state.world ===
                                                                    "app"
                                                                      ? "login-failed"
                                                                      : state.world ===
                                                                          "topup"
                                                                        ? "add-pollen-failed"
                                                                        : "error"
                                                                  : {
                                                                        "github-login":
                                                                            "github-approval",
                                                                        "github-signup":
                                                                            "github-authorize",
                                                                        "github-authorize":
                                                                            "loading",
                                                                        "device-start":
                                                                            "session",
                                                                    }[
                                                                        state
                                                                            .node
                                                                    ]);
                                                        const edge =
                                                            journeyOptions(
                                                                state,
                                                            ).find(
                                                                (edge) =>
                                                                    edge.to ===
                                                                    target,
                                                            );
                                                        if (edge) step(edge);
                                                    }}
                                                />
                                            ) : null}
                                        </ScreenWindow>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                    <aside className="journey-controls">
                        <div className="journey-switches">
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
                                            <legend>{group}</legend>
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
                                                state.world === "app" && (
                                                    <>
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
                                                            ) =>
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        appRequestError,
                                                                    }),
                                                                )
                                                            }
                                                        />
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
                                                            ) =>
                                                                setSettings(
                                                                    (old) => ({
                                                                        ...old,
                                                                        authorizationError:
                                                                            authorizationError as JourneySettings["authorizationError"],
                                                                    }),
                                                                )
                                                            }
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
                                                    <FlowSwitch
                                                        label="Account details unavailable"
                                                        checked={
                                                            settings.accountDetailsError
                                                        }
                                                        onChange={(
                                                            accountDetailsError,
                                                        ) =>
                                                            setSettings(
                                                                (current) => ({
                                                                    ...current,
                                                                    accountDetailsError,
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
                                                        onChange={(balances) =>
                                                            updateScreen(
                                                                (old) => ({
                                                                    ...old,
                                                                    ...balances,
                                                                }),
                                                            )
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
                                                        !(
                                                            state.world ===
                                                                "app" &&
                                                            [
                                                                "Signed in to GitHub",
                                                                "GitHub access approved",
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
                                    {group === "Pollen" && (
                                        <Surface
                                            variant="card-themed"
                                            className="journey-error-card"
                                        >
                                            {" "}
                                            <div
                                                className="journey-switch-row"
                                                data-disabled={
                                                    errorsDisabled || undefined
                                                }
                                            >
                                                <span>Request fails</span>
                                                <Switch
                                                    ariaLabel="Request fails"
                                                    checked={settings.errors}
                                                    disabled={errorsDisabled}
                                                    status={
                                                        settings.errors
                                                            ? "invalid"
                                                            : undefined
                                                    }
                                                    onChange={(errors) => {
                                                        setSettings((old) => ({
                                                            ...old,
                                                            errors,
                                                        }));
                                                        if (!errors)
                                                            setState((old) => ({
                                                                ...old,
                                                                scenario: "",
                                                                notice: "",
                                                            }));
                                                    }}
                                                />
                                            </div>
                                        </Surface>
                                    )}
                                </div>
                            ))}
                        </div>
                    </aside>
                </main>
            </div>
            <div className="journey-back-tools">
                <Button
                    data-theme="neutral"
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
                    ← Previous step
                </Button>
            </div>
        </div>
    );
}
