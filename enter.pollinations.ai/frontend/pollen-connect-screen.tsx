import { loginErrors } from "@shared/auth/login-errors.ts";
import { getPollenPackByKey, isPollenPackKey } from "@shared/pollen-packs.ts";
import type React from "react";
import { createRoot } from "react-dom/client";
import { INVALID_AUTHORIZATION_CLIENT_MESSAGE } from "../../shared/auth/authorize-config.ts";
import { createAccountSettingsFixture } from "./pollen-connect-account-settings-preview";
import type { AddPollenStage } from "./pollen-connect-add-pollen";
import {
    dashboardRouteForPreview,
    dashboardScreenForLocation,
    dashboardSignInResume,
} from "./pollen-connect-dashboard";
import { installDashboardDriver } from "./pollen-connect-dashboard-driver";
import { createDashboardExtrasFixture } from "./pollen-connect-dashboard-extras";
import { createDashboardFixture } from "./pollen-connect-dashboard-preview";
import { createDeploymentsFixture } from "./pollen-connect-deployments-preview";
import {
    previewAuthorizeParams,
    readPreviewRequest,
} from "./pollen-connect-request-config";
import {
    createWalletFixture,
    installWalletDriver,
} from "./pollen-connect-wallet-preview";
import type { AuthorizeConsent } from "./src/components/auth/authorize";
import { clearSignInContext, rememberSignIn } from "./src/lib/sign-in-context";

const query = new URLSearchParams(location.search);
// Canvas thumbnails display the UI without taking focus from the diagram.
if (query.get("thumbnail") === "1") document.documentElement.inert = true;
const screen = query.get("screen") || "oauth";
const adminPreview = query.get("admin_preview") === "1";
const dashboardPreview =
    screen.startsWith("dash-") || query.get("dashboard_preview") === "1";
if (dashboardPreview) query.set("dashboard_preview", "1");
const dashboardFixture = createDashboardFixture(query);
const accountSettingsFixture = createAccountSettingsFixture(query);
const dashboardExtrasFixture = createDashboardExtrasFixture(query);
const deploymentsFixture = createDeploymentsFixture(query);
const walletFixture = createWalletFixture(query);
const appRequest = readPreviewRequest(query);
const previewAppName =
    screen.startsWith("device") || query.get("login_flow") === "device"
        ? "Example CLI"
        : /^(oauth|direct)/.test(screen) || query.get("login_flow") === "app"
          ? "Example web app"
          : "App example";
// These examples own their viewport spacing; the document shell must not add padding.
document.body.classList.toggle(
    "connect-example-page",
    ["add-pollen-connect", "add-pollen-play", "dashboard-connected"].includes(
        screen,
    ),
);

const isNew = query.get("persona") === "new";
const emptyBalance = query.has("balance")
    ? query.get("balance") === "0"
    : isNew;
const badge = query.get("badge");
const wallet = query.get("wallet");
let paid = query.has("sim_paid")
    ? Number(query.get("sim_paid"))
    : badge === "paid-required" ||
        (badge === "no-pollen" && wallet !== "tier") ||
        ((badge == null || badge === "none") && emptyBalance)
      ? 0
      : 10;
const quest = query.has("sim_quest")
    ? Number(query.get("sim_quest"))
    : (badge === "no-pollen" && wallet !== "paid") ||
        ((badge == null || badge === "none") && emptyBalance)
      ? 0
      : 5;
const allowance = query.has("sim_budget")
    ? Number(query.get("sim_budget"))
    : badge === "limit-reached"
      ? 0
      : 5;
const name = isNew ? "New user" : "moss.exe";
const username = isNew ? "example-user" : "moss.exe";
const avatar = "/pollen-connect-preview/moss.png";
const requestedMode = query.get("theme");
const storedMode = localStorage.getItem("polli-color-mode");
const initialMode = requestedMode ?? storedMode ?? "light";
document.documentElement.classList.toggle("dark", initialMode === "dark");
let signedIn =
    screen !== "dash-sign-in" &&
    !screen.includes("signed-out") &&
    !["identity", "login-failed"].includes(screen);
const accountAction =
    screen.startsWith("account-") || query.get("account_action") === "1";
if (
    query.get("owner_session") === "signed-out" &&
    screen.startsWith("account-")
)
    signedIn = false;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
    const url = new URL(
        typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        location.href,
    );
    const method =
        init?.method || (input instanceof Request ? input.method : "GET");
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    if (url.pathname === "/api/auth/oauth2/public-client-prelogin")
        return json({
            client_name: "Admin example",
        });
    if (adminPreview && url.pathname === "/api/auth/sign-in/social") {
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (query.get("result") === "error") {
            query.delete("result");
            return json({ message: "Sign-in failed" }, 503);
        }
        goAdmin("admin-github");
        return new Promise<Response>(() => {});
    }
    if (
        url.pathname.startsWith("/api/stripe/billing") ||
        url.pathname === "/api/stripe/auto-top-up"
    ) {
        const body =
            method === "GET"
                ? {}
                : input instanceof Request
                  ? await input
                        .clone()
                        .json()
                        .catch(() => ({}))
                  : JSON.parse(String(init?.body ?? "{}"));
        const response = walletFixture(url, method, body);
        if (response) return response;
    }
    if (dashboardPreview) {
        const body =
            method === "GET"
                ? {}
                : input instanceof Request
                  ? await input
                        .clone()
                        .json()
                        .catch(() => ({}))
                  : JSON.parse(String(init?.body ?? "{}"));
        const response =
            accountSettingsFixture(url, method, body) ??
            dashboardExtrasFixture(url, method, signedIn) ??
            dashboardFixture(url, method, body) ??
            deploymentsFixture(url, method, body);
        if (response) {
            if (
                method === "POST" &&
                ["/api/auth/link-social", "/api/account/integrations"].includes(
                    url.pathname,
                )
            ) {
                const result = await response;
                if (!result.ok) return result;
                document.documentElement.dataset.previewExit =
                    url.pathname === "/api/auth/link-social"
                        ? "Continue on Discord. Use the Discord connected state to review the return."
                        : "Continue with the app provider. Use the App connected state to review the return.";
                window.dispatchEvent(new Event("dashboard-preview-exit"));
                return new Promise<Response>(() => {});
            }
            if (url.pathname === "/api/auth/delete-user") {
                const result = await response;
                if (!result.ok) return result;
                const next = new URLSearchParams(query);
                next.set("screen", "dash-news-signed-out");
                next.delete("action");
                next.delete("result");
                location.href = `/pollen-connect-screen.html?${next}`;
                // The real page returns to /news. Keep that navigation inside the lab.
                return new Promise<Response>(() => {});
            }
            return response;
        }
        if (url.pathname === "/api/auth/sign-in/social") {
            if (query.get("result") === "waiting")
                return new Promise<Response>(() => {});
            if (query.get("result") === "error") {
                query.delete("result");
                return json({ message: "Sign-in failed" }, 503);
            }
            const next = new URLSearchParams(query);
            next.set("screen", "dash-github");
            next.set(
                "resume",
                query.get("resume") ||
                    dashboardSignInResume(body.callbackURL) ||
                    "dash-wallet",
            );
            next.delete("action");
            location.href = `/pollen-connect-screen.html?${next}`;
            return new Promise<Response>(() => {});
        }
        if (url.pathname === "/api/auth/sign-out" && method === "POST") {
            const next = new URLSearchParams(query);
            next.set("screen", "dash-sign-in");
            next.delete("action");
            location.href = `/pollen-connect-screen.html?${next}`;
            return new Promise<Response>(() => {});
        }
    }
    // All writes stay local. Fixtures may pause or return inert sample data;
    // no credential is created and no request reaches a live mutation endpoint.
    if (method !== "GET") {
        if (accountAction && url.pathname === "/api/auth/sign-in/social") {
            if (query.get("account_case") === "sign-in-error")
                return json({ message: "Sign-in failed" }, 503);
            const next = new URLSearchParams(query);
            next.set("resume", screen.replace("-signed-out", ""));
            next.set("screen", "account-github");
            next.delete("action");
            location.href = `/pollen-connect-screen.html?${next}`;
            return json({ redirect: false });
        }
        if (
            accountAction &&
            url.pathname === "/api/api-keys/preview-key/update"
        ) {
            if (query.get("account_case") === "saving")
                return new Promise<Response>(() => {});
            if (query.get("account_case") === "save-error")
                return json(
                    {
                        error: {
                            message: "Couldn’t save app access. Try again.",
                        },
                    },
                    503,
                );
            const body = JSON.parse(String(init?.body ?? "{}"));
            if (body.pollenBudget != null)
                query.set("sim_budget", String(body.pollenBudget));
            return json({ success: true });
        }
        if (url.pathname === "/api/auth/sign-out" && method === "POST") {
            if (query.get("signout") === "error")
                return json(
                    {
                        code: "PREVIEW_ERROR",
                        message: "Preview sign-out failure",
                    },
                    500,
                );
            signedIn = false;
            return json({ success: true });
        }
        if (query.get("result") === "waiting")
            return new Promise<Response>(() => {});
        if (
            query.get("result") === "success" &&
            query.get("action") === "create" &&
            url.pathname === "/api/api-keys"
        ) {
            return json({
                id: "preview-created-key",
                key: "preview-only-not-a-valid-credential",
                name: "Example key",
            });
        }
        if (screen.startsWith("device")) {
            const failure = query.get("device_submit");
            if (
                [
                    "/api/api-keys",
                    "/api/device/approve",
                    "/api/device/deny",
                ].includes(url.pathname)
            ) {
                if (failure === "session")
                    return json({ message: "Unauthorized" }, 401);
                if (
                    (failure === "key" && url.pathname === "/api/api-keys") ||
                    (failure === "approve" &&
                        url.pathname === "/api/device/approve") ||
                    (failure === "deny" && url.pathname === "/api/device/deny")
                )
                    return json({ message: "Request failed. Try again." }, 503);
                return json(
                    url.pathname === "/api/api-keys"
                        ? {
                              id: "preview-device-key",
                              key: "preview-only-not-a-valid-credential",
                          }
                        : { success: true },
                );
            }
        }
        // The app was verified during lookup, then revoked before Allow access.
        // POST /api/api-keys revalidates it in validateClientRedirectBinding.
        if (
            query.get("action") === "authorize" &&
            url.pathname === "/api/api-keys"
        ) {
            const failure = query.get("authorize_error") ?? "revoked";
            if (failure === "code")
                return json({
                    id: "preview-key",
                    key: "preview-only-not-a-valid-credential",
                });
            if (failure === "key") return json({}, 500);
            if (failure === "session")
                return json({ error: { message: "Unauthorized" } }, 401);
            return json(
                {
                    success: false,
                    error: {
                        message: INVALID_AUTHORIZATION_CLIENT_MESSAGE,
                        code: "BAD_REQUEST",
                        timestamp: new Date().toISOString(),
                    },
                    status: 400,
                },
                400,
            );
        }
        if (
            query.get("authorize_error") === "code" &&
            url.pathname === "/api/oauth/code"
        )
            return json({}, 503);
        if (url.pathname === "/api/auth/api-key/delete")
            return json({ success: true });
        return json(
            {
                message: "Request failed. Try again.",
                error: { message: "Request failed. Try again." },
            },
            400,
        );
    }
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/models")
        return originalFetch(input, init);
    // Hold the real session check so loading is reviewable in its actual screen.
    if (
        url.pathname === "/api/auth/get-session" &&
        query.get("session") === "loading"
    )
        return new Promise<Response>(() => {});
    if (
        url.pathname === "/api/auth/get-session" &&
        query.get("session") === "error"
    )
        return json({ message: "Could not load account" }, 500);
    if (url.pathname === "/api/auth/get-session")
        return json(
            signedIn
                ? {
                      session: {
                          id: "preview-session",
                          expiresAt: "2099-01-01T00:00:00Z",
                      },
                      user: {
                          id: "preview-user",
                          name,
                          email: "user@example.test",
                          githubUsername: username,
                          image: avatar,
                      },
                  }
                : null,
        );
    if (url.pathname === "/api/app-lookup") {
        if (query.get("app_loading") === "1")
            return new Promise<Response>(() => {});
        if (query.get("request_error") === "lookup")
            return json({ error: { message: "App lookup unavailable" } }, 503);
        if (query.get("request_error") === "redirect")
            return json({
                found: false,
                error: "redirect_uri_mismatch",
                redirectUris: ["https://app.example/callback"],
                appName: appRequest.attribution ? previewAppName : undefined,
                githubUsername: appRequest.attribution
                    ? "developer"
                    : undefined,
            });
        if (query.get("request_error") === "app") return json({ found: false });
        return json({
            found: true,
            earningsEnabled: appRequest.earnings,
            appName: appRequest.attribution ? previewAppName : undefined,
            githubUsername: appRequest.attribution ? "developer" : undefined,
            redirectUris: [
                `${location.origin}/callback`,
                "https://app.example/callback",
            ],
        });
    }
    if (
        accountAction &&
        ["/api/api-keys", "/api/customer/balance"].includes(url.pathname)
    ) {
        if (query.get("account_case") === "loading")
            return new Promise<Response>(() => {});
        if (query.get("account_case") === "load-error")
            return json({ message: "Couldn’t load account" }, 503);
    }
    if (accountAction && url.pathname === "/api/api-keys")
        return json({
            data:
                query.get("account_case") === "missing"
                    ? []
                    : [
                          {
                              id: "preview-key",
                              name: "App example",
                              start: "sk_preview",
                              createdAt: "2026-09-01T00:00:00Z",
                              enabled: true,
                              pollenBalance: allowance,
                              permissions: { account: ["profile"] },
                              metadata: { keyType: "secret" },
                              byopClientKeyId: "preview-client",
                          },
                      ],
        });
    if (url.pathname.startsWith("/api/stripe/checkout-status/")) {
        if (query.get("account_case") === "payment-error") {
            if (dashboardPreview) query.set("account_case", "pending");
            return json({ message: "Unavailable" }, 503);
        }
        return json({
            status:
                query.get("account_case") === "credited"
                    ? "credited"
                    : "pending",
        });
    }
    if (url.pathname === "/api/customer/balance")
        return json({
            tierBalance: quest,
            packBalance: paid,
        });
    if (url.pathname === "/api/account/balance")
        return json({
            balance: paid + quest,
        });
    if (url.pathname === "/api/account/key")
        return json({ id: "preview-key", pollenBudget: allowance });
    if (url.pathname === "/api/account/profile")
        return json({
            name,
            githubUsername: username,
            image: avatar,
            email: "user@example.test",
            communityEndpointsAllowed: query.get("publisher") === "1",
            discordAvailable: dashboardPreview,
        });
    if (url.pathname === "/api/account/my-models")
        return json({ data: [], provider: { name: null, url: null } });
    if (url.pathname === "/api/device/info") {
        if (query.get("verify") === "waiting")
            return new Promise<Response>(() => {});
        const codeError = query.get("device_info");
        if (codeError === "expired")
            return json(
                { error: "expired_token", error_description: "Code expired" },
                400,
            );
        if (codeError === "invalid")
            return json({ error_description: "Invalid code" }, 400);
        if (codeError === "unavailable")
            throw new Error("Preview network failure");
        if (codeError === "used") return json({ status: "approved" });
        return json({
            status: "pending",
            clientId:
                query.get("device_client") === "none" ? null : "pk_ui_preview",
            scope: query.get("scope") ?? appRequest.scopes.join(" "),
        });
    }
    if (url.pathname === "/models" && query.get("model_catalog") === "loading")
        return new Promise<Response>(() => {});
    if (url.pathname === "/models" && query.get("model_catalog") === "error")
        return json({}, 503);
    if (url.pathname === "/models")
        return originalFetch("https://gen.pollinations.ai/models", {
            credentials: "omit",
            signal: init?.signal,
        });
    return json({ data: [] });
};
const {
    DashboardAccountMenu,
    DeviceAuthorizationResult,
    DashboardSignIn,
    AuthFlowLayout,
    ErrorBanner,
} = await import("@pollinations/ui/auth");
const {
    AppHeader,
    ColorModeToggle,
    Heading,
    Prose,
    setColorMode,
    useColorMode,
} = await import("@pollinations/ui");
if (requestedMode === "light" || requestedMode === "dark") {
    setColorMode(requestedMode);
}
function PreviewThemeSync() {
    useColorMode();
    return null;
}
const go = (next: string) => {
    const params = new URLSearchParams(query);
    params.set("screen", next);
    params.delete("error");
    params.delete("auth_error");
    location.href = `/pollen-connect-screen.html?${params}`;
};
function goAdmin(next: string, patch: Record<string, string> = {}) {
    const params = new URLSearchParams(query);
    for (const key of [
        "action",
        "result",
        "login_error",
        "auth_error",
        "admin_case",
        "signout",
        "signed_out",
        "drawer",
    ])
        params.delete(key);
    params.set("screen", next);
    for (const [key, value] of Object.entries(patch)) params.set(key, value);
    location.href = `/pollen-connect-screen.html?${params}`;
}
function completeAdminSignIn() {
    const result = query.get("admin_result") ?? "ready";
    const error = Object.values(loginErrors).find(
        (error) => error.code === result,
    );
    if (error)
        goAdmin(error.id, { login_error: error.code, login_flow: "admin" });
    else if (result !== "ready")
        goAdmin("dashboard-sign-in", { auth_error: result });
    else goAdmin("dashboard-connected", { drawer: "closed" });
}
let content: React.ReactNode;
if (
    [
        "account-github",
        "account-payment",
        "account-checkout",
        "dash-github",
        "admin-github",
        "dash-checkout",
        "dash-billing",
        "account-billing",
    ].includes(screen)
) {
    const { AccountProviderPreview } = await import(
        "./pollen-connect-account-provider"
    );
    content = (
        <AccountProviderPreview
            github={screen.includes("github")}
            billing={screen.endsWith("-billing")}
            onContinue={adminPreview ? completeAdminSignIn : undefined}
        />
    );
} else if (["add-pollen-play", "add-pollen-connect"].includes(screen)) {
    const { AddPollenPreview } = await import("./pollen-connect-add-pollen");
    content = (
        <AddPollenPreview
            initialStage={screen.slice("add-pollen-".length) as AddPollenStage}
            scenario={query.get("topup_case")}
        />
    );
} else if (screen === "device-result") {
    const { AuthAccountIdentity } = await import(
        "./src/components/auth/auth-account-identity.tsx"
    );
    content = (
        <DeviceAuthorizationResult
            denied={query.get("outcome") === "denied"}
            account={
                <AuthAccountIdentity
                    user={{
                        name,
                        email: "user@example.test",
                        image: avatar,
                        githubUsername: username,
                    }}
                    balances={{ paid, quest }}
                />
            }
        />
    );
} else if (screen === "key-edit" || screen === "key-delete") {
    const { PreviewKeyDialog } = await import("./pollen-connect-key-dialog");
    content = (
        <PreviewKeyDialog
            kind={query.get("key_kind")}
            deleting={screen === "key-delete"}
            onClose={() => go("keys")}
        />
    );
} else if (screen === "dashboard-sign-in") {
    content = (
        <DashboardSignIn
            appName="Admin example"
            isPending={query.get("admin_case") === "checking"}
            error={
                query.get("admin_case") === "session-error"
                    ? "Could not check your session. Please try again."
                    : null
            }
            onSignIn={() =>
                query.get("admin_session") === "1"
                    ? completeAdminSignIn()
                    : goAdmin("identity")
            }
        />
    );
} else if (screen === "dashboard-connected") {
    content = (
        <main className="min-h-screen">
            <AppHeader navLabel="Admin example links">
                <ColorModeToggle />
                <DashboardAccountMenu
                    user={{
                        name,
                        preferred_username: username,
                        picture: avatar,
                        email: "moss@example.test",
                    }}
                    className="polli:max-w-64 polli:shrink-0"
                    onSignOut={() => {
                        if (query.get("signout") === "error") {
                            query.delete("signout");
                            throw new Error("Preview sign-out failure");
                        }
                        goAdmin("dashboard-sign-in", { signed_out: "1" });
                    }}
                />
            </AppHeader>
        </main>
    );
} else if (screen === "guide") {
    const guide = (await import("../../BRING_YOUR_OWN_POLLEN.md?raw")).default;
    content = (
        <main style={{ maxWidth: 880, margin: "0 auto", padding: 32 }}>
            <Prose>{guide}</Prose>
        </main>
    );
} else {
    const { createMemoryHistory, createRouter, RouterProvider } = await import(
        "@tanstack/react-router"
    );
    const { routeTree } = await import("./src/routeTree.gen");
    const { Route: authorizeRoute } = await import(
        "./src/routes/authorize.tsx"
    );
    const { Authorize } = await import("./src/components/auth/authorize.tsx");
    const savedConsent = query.get("consent");
    const initialConsent: Partial<AuthorizeConsent> | undefined = savedConsent
        ? JSON.parse(savedConsent)
        : appRequest.models === "none"
          ? { generationEnabled: false }
          : undefined;
    const onConsentChange = (consent: AuthorizeConsent) => {
        document.documentElement.dataset.consent = JSON.stringify(consent);
    };
    authorizeRoute.update({
        component: () => (
            <Authorize
                initialConsent={initialConsent}
                onConsentChange={onConsentChange}
            />
        ),
    });
    let path = dashboardRouteForPreview(screen) ?? "/keys";
    if (screen.startsWith("dash-")) {
        if (screen === "dash-sign-in") path = "/sign-in";
        else if (screen === "dash-wallet") {
            const params = new URLSearchParams({
                pack: query.get("pack") || "p5",
            });
            if (
                ["pending", "credited", "payment-error"].includes(
                    query.get("account_case") || "",
                )
            )
                params.set("session_id", "preview-checkout");
            if (query.get("account_case") === "canceled")
                params.set("stripe_canceled", "true");
            path = `/pollen?${params}`;
        }
    } else if (
        screen.startsWith("account-key") ||
        screen.startsWith("account-wallet")
    ) {
        const params = new URLSearchParams({
            redirect: "https://app.example/",
        });
        if (screen.startsWith("account-key")) params.set("id", "preview-key");
        const state = query.get("account_case");
        if (["pending", "credited", "payment-error"].includes(state ?? ""))
            params.set("session_id", "preview-checkout");
        if (state === "canceled") params.set("stripe_canceled", "true");
        params.set("pack", query.get("pack") ?? "p5");
        path = `${screen.startsWith("account-key") ? "/edit-key" : "/top-up"}?${params}`;
    } else if (screen.startsWith("device-consent")) {
        path = `/authorize?${new URLSearchParams({ user_code: query.get("user_code") || "ABCDEFGH" })}`;
    } else if (
        screen.startsWith("direct") ||
        screen.startsWith("oauth") ||
        (screen === "login-failed" && query.get("login_flow") === "app")
    ) {
        let params: URLSearchParams;
        try {
            let catalog: Parameters<typeof previewAuthorizeParams>[1] = [];
            if (!["all", "none", "unlisted"].includes(appRequest.models)) {
                const response = await originalFetch(
                    "https://gen.pollinations.ai/models",
                    { credentials: "omit" },
                );
                if (!response.ok)
                    throw new Error(
                        "Could not load models. Reload to try again.",
                    );
                catalog = (await response.json()) as NonNullable<
                    typeof catalog
                >;
            }
            params = previewAuthorizeParams(query, catalog);
        } catch (error) {
            params = new URLSearchParams();
            authorizeRoute.update({
                component: () => (
                    <AuthFlowLayout actions={null}>
                        <Heading as="h1" size="section" className="mb-4">
                            Unable to load preview
                        </Heading>
                        <ErrorBanner>
                            {error instanceof Error
                                ? error.message
                                : "Could not load the model example."}
                        </ErrorBanner>
                    </AuthFlowLayout>
                ),
            });
        }
        params.set("client_id", "pk_ui_preview");
        params.set("redirect_uri", `${location.origin}/callback`);
        params.set("state", "preview-state");
        if (query.has("scope")) params.set("scope", query.get("scope") ?? "");
        if (
            screen.startsWith("oauth") ||
            (screen === "login-failed" && query.get("protocol") !== "direct")
        ) {
            params.set("response_type", "code");
            params.set("code_challenge", "a".repeat(43));
            params.set("code_challenge_method", "S256");
        }
        const requestError = query.get("request_error");
        const requestOverrides: Record<string, [string, string | null]> = {
            "missing-redirect": ["redirect_uri", null],
            "invalid-redirect": ["redirect_uri", "not-a-url"],
            "redirect-scheme": ["redirect_uri", "http://app.example/callback"],
            "response-type": ["response_type", "token"],
            "missing-client": ["client_id", null],
            "missing-challenge": ["code_challenge", null],
            "challenge-method": ["code_challenge_method", "plain"],
            "invalid-challenge": ["code_challenge", "invalid"],
        };
        const override = requestError
            ? requestOverrides[requestError]
            : undefined;
        if (override) {
            const [key, value] = override;
            if (value === null) params.delete(key);
            else params.set(key, value);
        }
        path = `/authorize?${params}`;
        if (screen === "login-failed") {
            rememberSignIn(path);
            if (query.get("origin") !== "none")
                Object.defineProperty(document, "referrer", {
                    value: "https://app.example/",
                });
            path = "/error?error=unknown";
        }
    } else if (Object.values(loginErrors).some((error) => error.id === screen))
        path = `/error?${new URLSearchParams({ error: query.get("login_error") ?? "unknown" })}`;
    else if (screen === "identity") path = "/app/sign-in?client_id=preview";
    else if (screen === "enter-signed-out") path = "/news";
    else if (screen === "enter-connected") path = "/pollen";
    else if (screen === "my-models") path = "/my-models";
    else if (screen.startsWith("device"))
        path =
            "/device" +
            (query.has("user_code")
                ? `?${new URLSearchParams({ user_code: query.get("user_code") ?? "" })}`
                : "");
    if (screen === "login-failed" && query.get("login_flow") === "device") {
        rememberSignIn(
            `/${query.get("device_route") === "authorize" ? "authorize" : "device"}?${new URLSearchParams({ user_code: query.get("user_code") ?? "" })}`,
        );
    }
    if (query.get("origin") === "none") {
        if (!(screen === "login-failed" && query.get("login_flow") === "app"))
            clearSignInContext();
        Object.defineProperty(document, "referrer", { value: "" });
    } else if (query.get("origin") !== "browser") {
        if (path.startsWith("/authorize")) {
            // The fixture supplies the originating browser page; Authorize
            // still verifies its origin against the app-lookup response.
            Object.defineProperty(document, "referrer", {
                value: "https://app.example/",
            });
        } else if (
            screen === "login-failed" &&
            !["app", "device"].includes(query.get("login_flow") ?? "")
        )
            clearSignInContext();
    }
    if (
        accountAction &&
        Object.values(loginErrors).some((error) => error.id === screen)
    )
        rememberSignIn(
            query.get("resume") === "account-wallet"
                ? "/top-up"
                : "/edit-key?id=preview-key",
        );
    if (adminPreview && screen === "login-failed")
        rememberSignIn("/app/sign-in?client_id=preview");
    const router = createRouter({
        routeTree,
        ...(dashboardPreview
            ? { defaultPendingMs: 0, defaultPendingMinMs: 0 }
            : {}),
        history: createMemoryHistory({ initialEntries: [path] }),
    });
    if (dashboardPreview) {
        // The requested dialog opens through a real control after the route renders.
        // Do not report its list as a user navigation during that initial render.
        let awaitingDialog = /-(create|edit|delete|visibility)$/.test(screen);
        const sync = () => {
            const path = router.state.location.pathname;
            const dialog = [
                ...document.querySelectorAll(
                    '[role="dialog"][data-state="open"]',
                ),
            ].at(-1);
            const title =
                dialog?.querySelector('h1,h2,h3,h4,[role="heading"]')
                    ?.textContent ?? "";
            const node = dashboardScreenForLocation(path, title);
            const expected = screen
                .replace(/^dash-/, "")
                .replace(
                    /^(keys|apps|models|agents)-/,
                    (group) => `${group.slice(0, -2)}-`,
                );
            if (awaitingDialog && node !== expected) return;
            awaitingDialog = false;
            if (document.documentElement.dataset.dashboardNode !== node) {
                document.documentElement.dataset.dashboardNode = node;
                window.dispatchEvent(
                    new CustomEvent("dashboard-preview-location", {
                        detail: node,
                    }),
                );
            }
        };
        router.subscribe("onResolved", sync);
        new MutationObserver(sync).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["data-state"],
        });
        // Every destination outside this review is explicitly marked, rather than silently swallowed.
        document.addEventListener(
            "click",
            (event) => {
                const target = (event.target as Element).closest("a,button");
                if (!target) return;
                const href = target.getAttribute("href");
                if (href?.startsWith("/api/stripe/checkout/")) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const next = new URLSearchParams(query);
                    next.set("screen", "dash-checkout");
                    next.set(
                        "pack",
                        new URL(href, location.origin).pathname
                            .split("/")
                            .at(-1) ?? "p5",
                    );
                    next.delete("action");
                    location.href = `/pollen-connect-screen.html?${next}`;
                } else if (target.textContent?.trim() === "Check payment") {
                    query.set("account_case", "credited");
                    if (!query.has("preview_credited")) {
                        query.set("preview_credited", "1");
                        paid +=
                            getPollenPackByKey(
                                (query.get("pack") || "p5") as "p5",
                            )?.amountUsd || 5;
                    }
                } else if (
                    target.textContent?.trim() === "Try again" &&
                    router.state.location.pathname === "/error"
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    const next = new URLSearchParams(query);
                    next.set("screen", "dash-sign-in");
                    next.delete("action");
                    location.href = `/pollen-connect-screen.html?${next}`;
                } else if (
                    href?.startsWith("/") &&
                    ![
                        "/pollen",
                        "/keys",
                        "/apps",
                        "/my-models",
                        "/agents",
                        "/news",
                        "/models",
                        "/activity",
                        "/quests",
                        "/account",
                    ].includes(href.split("?")[0])
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    document.documentElement.dataset.previewExit = `${target.textContent?.trim() || "This page"} is outside this preview. Use the supported dashboard sections to continue.`;
                    window.dispatchEvent(new Event("dashboard-preview-exit"));
                }
            },
            true,
        );
    }
    if (adminPreview) {
        document.addEventListener(
            "click",
            (event) => {
                const target = (event.target as Element)?.closest("button, a");
                if (
                    screen === "login-failed" &&
                    target?.textContent?.trim() === "Try again"
                ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    goAdmin("identity");
                }
            },
            true,
        );
    }
    content = <RouterProvider router={router} />;
}
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Connect preview root is missing");
createRoot(rootElement).render(
    <>
        <PreviewThemeSync />
        {content}
    </>,
);
if (
    query.get("drawer") !== "closed" &&
    (query.get("journey") !== "1" ||
        query.get("drawer") === "open" ||
        query.get("action") === "sign-out" ||
        ["api-key", "app-key"].includes(screen)) &&
    ["dashboard-connected", "enter-connected", "api-key", "app-key"].includes(
        screen,
    )
) {
    const poll = setInterval(() => {
        const name = ["dashboard-connected", "enter-connected"].includes(screen)
            ? `Account menu for ${username}`
            : screen === "app-key"
              ? "Add App"
              : "Add Key";
        const button = [...document.querySelectorAll("button")].find(
            (b) =>
                b.getClientRects().length &&
                !b.closest("[inert]:not(html)") &&
                (b.getAttribute("aria-label") === name ||
                    b.textContent.trim() === name),
        );
        if (button) {
            button.click();
            clearInterval(poll);
        }
    }, 200);
    setTimeout(() => clearInterval(poll), 15000);
}

if (dashboardPreview) installDashboardDriver(screen, query);
if (dashboardPreview || accountAction) installWalletDriver(query);
const previewAction = query.get("action");
if (screen === "add-pollen-play" && query.get("app_menu") === "open") {
    const reveal = setInterval(() => {
        const button = document.querySelector<HTMLButtonElement>(
            'button[aria-label="App account menu"]',
        );
        if (button?.getClientRects().length) {
            button.click();
            clearInterval(reveal);
        }
    }, 200);
    setTimeout(() => clearInterval(reveal), 5000);
}
if (
    previewAction &&
    !previewAction.startsWith("billing-") &&
    !dashboardPreview &&
    (accountAction ||
        dashboardPreview ||
        query.get("journey") !== "1" ||
        ["error", "waiting"].includes(query.get("result") ?? "") ||
        (adminPreview && previewAction === "sign-out"))
) {
    const labels: Record<string, string> = {
        "sign-in": "Sign in with GitHub",
        authorize: "Allow access",
        deny: "Cancel",
        create: "Create key",
        save: "Save",
        "close-key": "Cancel",
        "sign-out": "Sign out",
        delete: "Delete",
    };
    const activate = () => {
        const button = [
            ...document.querySelectorAll<HTMLButtonElement>("button"),
        ].find(
            (candidate) =>
                candidate.textContent?.trim() === labels[previewAction] &&
                !candidate.disabled &&
                candidate.getClientRects().length,
        );
        if (!button) return;
        observer.disconnect();
        button.dataset.previewAction = "true";
        button.click();
        delete button.dataset.previewAction;
    };
    const observer = new MutationObserver(activate);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
    });
    activate();
}

// Preview navigation stays focused on the account and payment flow.
const lockDashboardDrawer = screen === "enter-signed-out";
function constrainDashboardPreview() {
    if (dashboardPreview) return;
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/news"]',
    )) {
        link.setAttribute("aria-disabled", "true");
        link.tabIndex = -1;
    }
    if (lockDashboardDrawer) {
        for (const button of document.querySelectorAll<HTMLButtonElement>(
            'button[aria-label="Close navigation"]',
        ))
            button.disabled = true;
    }
}
const dashboardPreviewObserver = new MutationObserver(
    constrainDashboardPreview,
);
dashboardPreviewObserver.observe(rootElement, {
    childList: true,
    subtree: true,
});
constrainDashboardPreview();
document.addEventListener(
    "click",
    (event) => {
        const link = (event.target as Element).closest('a[href^="/news"]');
        if (link && !dashboardPreview) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    },
    true,
);
if (lockDashboardDrawer)
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true,
    );

if (
    lockDashboardDrawer ||
    screen === "dash-sign-in" ||
    query.get("drawer") === "open" ||
    (screen.startsWith("enter-") &&
        query.get("journey") !== "1" &&
        query.get("drawer") !== "closed")
) {
    const reveal = setInterval(() => {
        const button = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Open navigation"]',
        );
        if (button?.getClientRects().length) {
            button.click();
            clearInterval(reveal);
        }
    }, 200);
    setTimeout(() => clearInterval(reveal), 5000);
}

// Translate hosted account destinations into local fixtures. Wallet opens in a
// separate tab from an unsaved editor, just like the real route.
if (accountAction)
    document.addEventListener(
        "click",
        (event) => {
            const anchor = (event.target as Element)?.closest?.("a");
            const button = (event.target as Element)?.closest?.("button");
            const next = new URLSearchParams(query);
            next.delete("action");
            let destination: string | undefined;
            if (anchor) {
                const url = new URL(anchor.href);
                if (url.pathname === "/top-up") destination = "account-wallet";
                else if (url.pathname === "/edit-key")
                    destination = "account-key";
                else if (url.pathname.startsWith("/api/stripe/checkout/")) {
                    destination = "account-payment";
                    next.set("pack", url.pathname.split("/").at(-1) ?? "p5");
                } else if (url.hostname === "app.example")
                    destination = "add-pollen-play";
                if (destination) {
                    event.preventDefault();
                    next.set("screen", destination);
                    next.delete("account_case");
                    next.set("account_action", "1");
                    const href = `/pollen-connect-screen.html?${next}`;
                    if (anchor.target === "_blank")
                        window.open(href, "_blank", "noopener");
                    else location.href = href;
                }
            } else if (
                screen === "login-failed" &&
                button?.textContent?.trim() === "Try again"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                next.set(
                    "screen",
                    query.get("resume") === "account-wallet"
                        ? "account-wallet-signed-out"
                        : "account-key-signed-out",
                );
                next.delete("account_case");
                location.href = `/pollen-connect-screen.html?${next}`;
            } else if (
                query.get("journey") === "1" &&
                button?.textContent?.trim() === "Check payment"
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
                next.set("account_case", "credited");
                const packKey = next.get("pack") ?? "p5";
                const amount = isPollenPackKey(packKey)
                    ? (getPollenPackByKey(packKey)?.amountUsd ?? 5)
                    : 5;
                next.set("sim_paid", String(paid + amount));
                location.href = `/pollen-connect-screen.html?${next}`;
            }
        },
        true,
    );
