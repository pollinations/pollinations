import { describe, expect, it } from "vitest";
import { screenRoute } from "../screen-route";

const origin = "http://localhost:4180";
const state = {
    conditions: {
        account: "signed-in",
        pollen: "paid",
        allowance: "available",
        role: "member",
    } as const,
    connection: {
        clientId: "pk_public_test_app",
        keyId: null,
        allowance: null,
        enabled: false,
    },
    admin: { clientId: "pk_public_test_admin", registered: false },
    device: null,
};
function route(
    query: Record<string, string>,
    selected: Parameters<typeof screenRoute>[1] = state,
) {
    const target = screenRoute(new URLSearchParams(query), selected, origin);
    if (!target) throw new Error("Missing real route");
    return new URL(target, origin);
}
describe("real preview routes", () => {
    it("supplies a registered client and PKCE challenge for consent previews", () => {
        const url = route({ screen: "oauth" });
        expect(url.pathname).toBe("/authorize");
        expect(url.searchParams.get("client_id")).toBe(
            state.connection.clientId,
        );
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("code_challenge")).toMatch(
            /^[A-Za-z0-9_-]{43}$/,
        );
        expect(url.searchParams.has("code_verifier")).toBe(false);
    });
    it.each([
        ["missing-redirect", "redirect_uri", null],
        ["invalid-redirect", "redirect_uri", "not a URL"],
        ["redirect-scheme", "redirect_uri", "ftp://localhost/callback"],
        ["response-type", "response_type", "unsupported"],
        ["missing-client", "client_id", null],
        ["missing-challenge", "code_challenge", null],
        ["challenge-method", "code_challenge_method", "plain"],
        ["invalid-challenge", "code_challenge", "invalid"],
    ] as const)("passes the selected invalid input to Enter for %s", (request_error, field, expected) => {
        const url = route({ screen: "oauth", request_error });
        expect(url.pathname).toBe("/authorize");
        expect(url.searchParams.get(field)).toBe(expected);
    });
    it("uses actual key identity without inventing one when none exists", () => {
        expect(route({ screen: "account-key" }).searchParams.get("id")).toBe(
            "",
        );
        const withKey = {
            ...state,
            connection: { ...state.connection, keyId: "existing-key-id" },
        };
        expect(
            route({ screen: "account-key" }, withKey).searchParams.get("id"),
        ).toBe("existing-key-id");
    });
    it("does not issue a device request when opening the code screen", () => {
        expect(route({ screen: "device-code" }).pathname).toBe("/device");
        expect(state.device).toBeNull();
    });
    it("does not force a wallet persona, balance, or pending state", () => {
        const url = route({
            screen: "account-wallet",
            owner_session: "signed-in",
            balance: "positive",
            wallet_error: "1",
        });
        expect(url.pathname).toBe("/top-up");
        expect([...url.searchParams.keys()]).toEqual(["redirect"]);
    });
    it("keeps manual device entry separate from opening a device link", () => {
        const device = {
            ...state,
            device: {
                userCode: "ACTUALCODE",
                verificationUri: `${origin}/device`,
                verificationUriComplete: `${origin}/authorize?user_code=ACTUALCODE`,
                status: "pending" as const,
            },
        };
        expect(route({ screen: "device" }, device).pathname).toBe("/device");
        expect(
            route(
                { screen: "device-consent", user_code: "ABCD-EFGH" },
                device,
            ).searchParams.get("user_code"),
        ).toBe("ACTUALCODE");
    });
    it.each([
        "dash-wallet",
        "account-wallet",
    ])("opens main’s checkout return contract on %s", (screen) => {
        const url = route({ screen, account_case: "checkout-return" });
        expect(url.pathname).toBe(
            screen === "dash-wallet" ? "/pollen" : "/top-up",
        );
        expect(url.searchParams.get("stripe_success")).toBe("true");
        expect(url.searchParams.get("session_id")).toBe("cs_flow_review");
    });
    it("opens actual cancellation and missing-key routes without changing records", () => {
        expect(
            route({
                screen: "account-wallet",
                account_case: "canceled",
            }).searchParams.get("stripe_canceled"),
        ).toBe("true");
        expect(
            route(
                { screen: "account-key", account_case: "missing" },
                {
                    ...state,
                    connection: { ...state.connection, keyId: "existing-key" },
                },
            ).searchParams.get("id"),
        ).toBe("");
    });
    it("preserves a known admin error without starting OAuth", () => {
        const url = route({
            screen: "dashboard-sign-in",
            auth_error: "admin_required",
        });
        expect(url.searchParams.get("auth_error")).toBe("admin_required");
        expect(url.pathname).toBe("/");
        expect([...url.searchParams.keys()]).toEqual(["auth_error"]);
    });
});
