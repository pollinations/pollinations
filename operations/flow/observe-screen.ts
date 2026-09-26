import { dashboardScreenForLocation } from "./flow-dashboard";
import type { JourneyEntrance } from "./flow-journey-state";
import { ADMIN_ORIGIN } from "./local-origins";
import { deviceCodeExpectations, loginSituations } from "./review-auth";

export type ObservedScreen = {
    node: string;
    title: string;
    path: string;
    flow?: JourneyEntrance;
    canGoBack?: boolean;
};

export function observeScreen(
    doc: Document,
    previous?: ObservedScreen,
): ObservedScreen | undefined {
    const current = doc.defaultView;
    if (!current) return;
    const { pathname: path, search } = current.location;
    if (path === "/flow-screen.html") return;
    const title = doc.querySelector("h1")?.textContent?.trim() ?? "";
    const buttons = [...doc.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
    );
    const sdk = doc
        .querySelector("[data-flow-state]")
        ?.getAttribute("data-flow-state");
    let node: string;
    let flow: JourneyEntrance | undefined;
    if (path === "/flow-example.html") {
        flow = "app";
        node =
            sdk === "signed-out"
                ? "app-connect"
                : sdk === "connection-error"
                  ? "app-callback-error"
                  : sdk === "account-error"
                    ? "app-account-error"
                    : sdk === "checking-connection"
                      ? "app-callback"
                      : sdk === "connected"
                        ? "app-connected"
                        : "app-callback";
    } else if (path === "/__flow/identity") {
        node = "github-handoff";
    } else if (path === "/error") {
        const code = new URLSearchParams(search).get("error");
        node =
            Object.values(loginSituations).find((entry) => entry.code === code)
                ?.id ?? "login-failed";
    } else if (path === "/authorize") {
        const device = Boolean(new URLSearchParams(search).get("user_code"));
        flow = device ? "device" : "app";
        const alert = doc.querySelector('[role="alert"]');
        const signingIn = buttons.some(
            (text) =>
                text?.includes("Sign in with GitHub") ||
                text?.includes("Signing in"),
        );
        if (device && buttons.includes("Connecting…")) {
            node = "device-approving";
        } else if (signingIn) {
            node = alert
                ? "error"
                : buttons.some((text) => text?.includes("Signing in"))
                  ? device
                      ? "device-signing-in"
                      : "app-signing-in"
                  : "sign-in";
        } else if (alert) {
            // Device failures share one layout and Decline action. The DOM does
            // not distinguish their endpoint, so do not infer it from setup.
            node = device
                ? "device-request-invalid"
                : previous &&
                    ["app-connecting", "app-connection-failed"].includes(
                        previous.node,
                    )
                  ? "app-connection-failed"
                  : "blocked";
        } else if (/Access allowed/i.test(title)) node = "device-result";
        else if (/declined/i.test(title)) node = "device-declined";
        else if (
            buttons.includes("Allow access") ||
            buttons.includes("Connecting…")
        )
            node =
                !device && buttons.includes("Connecting…")
                    ? "app-connecting"
                    : "consent";
        else node = device ? "device-checking" : "loading";
    } else if (path === "/device") {
        flow = "device";
        if (doc.querySelector("#device-code-form")) {
            const error = Object.entries(deviceCodeExpectations).find(
                ([, text]) =>
                    doc
                        .querySelector("#device-code-form")
                        ?.textContent?.includes(text),
            );
            node = buttons.includes("Checking code…")
                ? "device-verifying"
                : error
                  ? `device-code-${error[0]}`
                  : "device-code";
        } else {
            node = doc.querySelector("output")
                ? "device-session"
                : doc.querySelector('[role="alert"]')
                  ? "error"
                  : buttons.some((text) => text?.includes("Signing in"))
                    ? "device-signing-in"
                    : "sign-in";
        }
    } else if (path === "/edit-key") node = "account-key";
    else if (path === "/top-up") node = "account-wallet";
    else if (path === "/app/sign-in") {
        flow = "admin";
        node = "identity";
    } else if (current.location.origin === ADMIN_ORIGIN) {
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
        node = dashboardScreenForLocation(
            path,
            dialogTitle,
            current.location.hash,
        );
    }
    return { node, title, path, flow };
}
