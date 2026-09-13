import { loginErrors } from "@shared/auth/login-errors.ts";
import { dashboardSignInErrors } from "../../packages/ui/src/modules/auth/dashboard-sign-in-errors.ts";
import type { LocalState } from "./live-client";
import { dashboardRouteForPreview } from "./pollen-connect-dashboard";

// Inventory entries select real routes. They never supply account data, replace
// API responses, or submit a form just to make a particular state appear.
export function screenRoute(
    query: URLSearchParams,
    state: Pick<LocalState, "connection" | "device" | "admin">,
    origin: string,
) {
    const screen = query.get("screen") ?? "oauth";
    const error = Object.values(loginErrors).find(
        (entry) => entry.id === screen,
    );
    if (error) return `/error?error=${encodeURIComponent(error.code)}`;

    const walletSearch = new URLSearchParams();
    if (query.get("account_case") === "canceled")
        walletSearch.set("stripe_canceled", "true");
    if (
        ["pending", "payment-error", "credited"].includes(
            query.get("account_case") ?? "",
        )
    )
        walletSearch.set("session_id", "cs_connect_review");
    const dashboard = dashboardRouteForPreview(screen);
    if (dashboard)
        return dashboard === "/pollen" && walletSearch.size
            ? `${dashboard}?${walletSearch}`
            : dashboard;
    if (screen === "dash-sign-in") return "/sign-in?next=%2Fpollen";
    if (screen === "dash-wallet")
        return walletSearch.size ? `/pollen?${walletSearch}` : "/pollen";
    if (screen === "dashboard-sign-in" || screen === "dashboard-connected") {
        const params = new URLSearchParams({ signed_out: "1" });
        const error = query.get("auth_error");
        if (error && Object.hasOwn(dashboardSignInErrors, error))
            params.set("auth_error", error);
        return `/connect-admin.html?${params}`;
    }
    if (screen === "identity")
        return `/app/sign-in?client_id=${encodeURIComponent(state.admin.clientId)}`;
    if (screen.startsWith("account-key")) {
        const params = new URLSearchParams({
            id:
                query.get("account_case") === "missing"
                    ? ""
                    : (state.connection.keyId ?? ""),
            redirect: `${origin}/connect-example.html`,
        });
        return `/edit-key?${params}`;
    }
    if (screen.startsWith("account-wallet")) {
        const params = new URLSearchParams({
            redirect: `${origin}/connect-example.html`,
        });
        for (const [key, value] of walletSearch) params.set(key, value);
        return `/top-up?${params}`;
    }
    if (["add-pollen-connect", "add-pollen-play"].includes(screen))
        return "/connect-example.html";

    if (screen.startsWith("device")) {
        const code =
            query.get("user_code") === "invalid" ||
            query.get("device_info") === "invalid"
                ? "CONNECT_INVALID_CODE"
                : query.get("user_code") === ""
                  ? ""
                  : (state.device?.userCode ?? "");
        if (screen.startsWith("device-consent"))
            return `/authorize?${new URLSearchParams({ user_code: code })}`;
        if (query.has("user_code") || query.has("device_info"))
            return `/device?${new URLSearchParams({ user_code: code })}`;
        return screen === "device" ||
            screen === "device-code" ||
            screen === "device-signed-out"
            ? "/device"
            : (state.device?.verificationUriComplete ?? "/device");
    }
    if (screen.startsWith("oauth") || screen.startsWith("direct")) {
        const params = new URLSearchParams({
            client_id: state.connection.clientId,
            redirect_uri: `${origin}/connect-example.html`,
            response_type: "code",
            code_challenge_method: "S256",
            // Public challenge only; thumbnails cannot grant access. Journey
            // starts in the SDK, which creates and retains its own verifier.
            code_challenge: "A".repeat(43),
            state: "connect-inventory",
            scope: "profile usage keys",
            budget: "5",
            expiry: "7",
        });
        if (
            query.get("login_error") ||
            query.get("sign_in_error") === "1" ||
            (query.get("action") === "sign-in" &&
                query.get("result") === "error")
        )
            params.set("sign_in_error", "1");
        // Invalid-request inventory entries exercise the real validator with
        // invalid public inputs; the server supplies the resulting error.
        const invalid = query.get("request_error");
        if (invalid === "redirect")
            params.set("redirect_uri", `${origin}/unregistered-callback`);
        if (invalid === "app")
            params.set("client_id", "pk_connect_missing_app");
        if (invalid === "missing-redirect") params.delete("redirect_uri");
        if (invalid === "invalid-redirect")
            params.set("redirect_uri", "not a URL");
        if (invalid === "redirect-scheme")
            params.set("redirect_uri", "ftp://localhost/callback");
        if (invalid === "response-type")
            params.set("response_type", "unsupported");
        if (invalid === "missing-client") params.delete("client_id");
        if (invalid === "missing-challenge") params.delete("code_challenge");
        if (invalid === "challenge-method")
            params.set("code_challenge_method", "plain");
        if (invalid === "invalid-challenge")
            params.set("code_challenge", "invalid");
        return `/authorize?${params}`;
    }
    return undefined;
}
