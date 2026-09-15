import { getLoginError } from "@shared/auth/login-errors.ts";
import { useEffect, useRef } from "react";
import { deviceCodeMessages } from "../../enter.pollinations.ai/frontend/src/lib/device-request";
import { useConnectConditions } from "./conditions";
import { dashboardScreenForLocation } from "./pollen-connect-dashboard";
import type { JourneyEntrance } from "./pollen-connect-journey-state";

export type ObservedScreen = {
    node: string;
    title: string;
    path: string;
    flow?: JourneyEntrance;
};

export function observeScreen(doc: Document): ObservedScreen | undefined {
    const current = doc.defaultView;
    if (!current) return;
    const { pathname: path, search } = current.location;
    if (path === "/pollen-connect-screen.html") return;
    const title = doc.querySelector("h1")?.textContent?.trim() ?? "";
    const buttons = [...doc.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
    );
    const sdk = doc
        .querySelector("[data-connect-state]")
        ?.getAttribute("data-connect-state");
    let node: string;
    let flow: JourneyEntrance | undefined;
    if (path === "/connect-example.html") {
        flow = "app";
        node =
            sdk === "signed-out"
                ? "app-connect"
                : sdk === "connection-error" || sdk === "connection-check-error"
                  ? "app-callback-error"
                  : sdk === "account-error"
                    ? "app-account-error"
                    : sdk === "checking-connection"
                      ? "app-callback"
                      : "app-connected";
    } else if (path === "/__connect/identity") {
        node = "github-handoff";
    } else if (path === "/error") {
        node = getLoginError(new URLSearchParams(search).get("error") ?? "").id;
    } else if (path === "/authorize") {
        const device = Boolean(new URLSearchParams(search).get("user_code"));
        flow = device ? "device" : "app";
        const alert = doc.querySelector('[role="alert"]');
        const signingIn =
            doc.querySelector("#sign-in-title") ||
            buttons.some((text) => text?.includes("Sign in with GitHub"));
        if (device && buttons.includes("Declining…")) {
            node = "device-denying";
        } else if (device && buttons.includes("Connecting…")) {
            node = "device-approving";
        } else if (doc.querySelector("#connection-error-title")) {
            if (device) {
                const codeError = Object.entries(deviceCodeMessages).find(
                    ([, message]) => alert?.textContent?.trim() === message,
                );
                // Read Enter's rendered error and operation, not the chosen
                // situation: a retry can move to a different recovery path.
                const operation =
                    [...doc.querySelectorAll("p")].find((p) =>
                        /^(requested access|could not connect|cannot connect) to your /.test(
                            p.textContent ?? "",
                        ),
                    )?.textContent ?? "";
                node = codeError
                    ? `device-request-${codeError[0]}`
                    : operation.startsWith("requested access")
                      ? "device-submit-deny"
                      : operation.startsWith("could not connect")
                        ? "device-submit-key"
                        : buttons.includes("Try again")
                          ? "device-request-lookup"
                          : "device-request-app";
            } else {
                node = /could not connect/.test(doc.body.textContent ?? "")
                    ? "app-connection-failed"
                    : "blocked";
            }
        } else if (signingIn) {
            node =
                device && buttons.includes("Sign in again")
                    ? "device-submit-session"
                    : alert
                      ? device
                          ? "sign-in-errors"
                          : "error"
                      : "sign-in";
        } else if (/approved/i.test(title)) node = "device-result";
        else if (/declined/i.test(title)) node = "device-declined";
        else if (
            buttons.includes("Allow access") ||
            buttons.includes("Connecting…")
        )
            node = "consent";
        else node = device ? "device-checking" : "loading";
    } else if (path === "/device") {
        flow = "device";
        node = doc.querySelector("#device-code-form")
            ? "device-code"
            : doc.querySelector('[role="alert"]')
              ? "sign-in-errors"
              : "sign-in";
    } else if (path === "/edit-key") node = "account-key";
    else if (path === "/top-up") node = "account-wallet";
    else if (path === "/app/sign-in") {
        flow = "admin";
        node = "identity";
    } else if (path === "/connect-admin.html") {
        flow = "admin";
        node = doc.querySelector('[data-admin-connected="true"]')
            ? "dashboard-connected"
            : "dashboard-sign-in";
    } else {
        flow = "account";
        const dialogTitle =
            [...doc.querySelectorAll('[role="dialog"] h2')].find(
                (heading) =>
                    !heading.closest(
                        '[hidden], [aria-hidden="true"], [data-state="closed"]',
                    ),
            )?.textContent ?? "";
        node = dashboardScreenForLocation(path, dialogTitle);
    }
    return { node, title, path, flow };
}

// Observe real navigation and DOM; never infer progress from a clicked label,
// change a route's loader, or manufacture a response to advance the journey.
export function RuntimeFrame({
    src,
    title,
    interactive = true,
    onReport,
    onOpenDashboard,
    onClose,
    onKeyDown,
}: {
    src: string;
    title: string;
    interactive?: boolean;
    onReport?: (screen: ObservedScreen) => void;
    onOpenDashboard?: () => void;
    onClose?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
}) {
    const { state, revision, restarting } = useConnectConditions();
    const frame = useRef<HTMLIFrameElement>(null);
    const observer = useRef<MutationObserver | undefined>(undefined);
    const callbacks = useRef({
        onReport,
        onOpenDashboard,
        onClose,
        onKeyDown,
    });
    callbacks.current = {
        onReport,
        onOpenDashboard,
        onClose,
        onKeyDown,
    };
    useEffect(() => {
        if (restarting) observer.current?.disconnect();
        return () => observer.current?.disconnect();
    }, [restarting]);
    useEffect(() => {
        const refresh = () => frame.current?.contentWindow?.location.reload();
        import.meta.hot?.on("connect:source-refreshed", refresh);
        return () => import.meta.hot?.off("connect:source-refreshed", refresh);
    }, []);
    if (!state || restarting) return null;
    return (
        <iframe
            key={revision}
            ref={frame}
            src={src}
            title={title}
            loading={interactive ? "eager" : "lazy"}
            tabIndex={interactive ? 0 : -1}
            inert={!interactive}
            onLoad={() => {
                observer.current?.disconnect();
                const doc = frame.current?.contentDocument;
                if (!doc?.defaultView) return;
                doc.documentElement.inert = !interactive;
                let last = "";
                const report = () => {
                    const screen = observeScreen(doc);
                    if (!screen) return;
                    const key = JSON.stringify(screen);
                    if (key === last) return;
                    last = key;
                    callbacks.current.onReport?.(screen);
                };
                observer.current = new MutationObserver(report);
                observer.current.observe(doc.documentElement, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: [
                        "data-connect-state",
                        "data-admin-connected",
                        "aria-busy",
                        "hidden",
                        "aria-hidden",
                        "data-state",
                    ],
                });
                report();
                doc.defaultView.addEventListener("popstate", report);
                doc.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") callbacks.current.onClose?.();
                    callbacks.current.onKeyDown?.(event);
                });
                doc.addEventListener(
                    "click",
                    (event) => {
                        const link = (event.target as Element)?.closest?.("a");
                        if (!link || !interactive) return;
                        if (
                            link.dataset.pollinationsAction === "dashboard" &&
                            callbacks.current.onOpenDashboard
                        ) {
                            event.preventDefault();
                            event.stopImmediatePropagation();
                            callbacks.current.onOpenDashboard();
                        }
                    },
                    true,
                );
            }}
        />
    );
}
