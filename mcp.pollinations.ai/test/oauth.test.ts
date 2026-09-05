import type {
    AuthRequest,
    OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginAuthorization, finishAuthorization } from "../src/oauth";
import type { Env } from "../src/types";

class MemoryKv {
    values = new Map<string, string>();

    async put(key: string, value: string) {
        this.values.set(key, value);
    }

    async get<T>(key: string): Promise<T | null> {
        const value = this.values.get(key);
        return value ? (JSON.parse(value) as T) : null;
    }

    async delete(key: string) {
        this.values.delete(key);
    }
}

const oauthRequest: AuthRequest = {
    responseType: "code",
    clientId: "mcp-client",
    redirectUri: "http://127.0.0.1:5555/callback",
    scope: [],
    state: "client-state",
    codeChallenge: "downstream-challenge",
    codeChallengeMethod: "S256",
    resource: "https://mcp.pollinations.ai",
};

function createEnv() {
    const kv = new MemoryKv();
    const oauth = {
        parseAuthRequest: vi.fn().mockResolvedValue(oauthRequest),
        completeAuthorization: vi.fn().mockResolvedValue({
            redirectTo: `${oauthRequest.redirectUri}?code=mcp-code&state=client-state`,
        }),
    };
    const env = {
        OAUTH_KV: kv as unknown as KVNamespace,
        OAUTH_PROVIDER: oauth as unknown as OAuthHelpers,
        ENTER_CLIENT_ID: "pk_mcp_app",
        ENTER_ORIGIN: "https://enter.pollinations.ai",
        GEN_ORIGIN: "https://gen.pollinations.ai",
    } satisfies Env;
    return { env, kv, oauth };
}

function header(response: Response, name: string): string {
    const value = response.headers.get(name);
    expect(value).toBeTruthy();
    return value ?? "";
}

function queryParam(url: URL, name: string): string {
    const value = url.searchParams.get(name);
    expect(value).toBeTruthy();
    return value ?? "";
}

afterEach(() => vi.restoreAllMocks());

describe("Enter OAuth bridge", () => {
    it("starts an upstream authorization-code flow with PKCE only", async () => {
        const { env, kv } = createEnv();
        const response = await beginAuthorization(
            new Request("https://mcp.pollinations.ai/authorize?client_id=x"),
            env,
        );

        expect(response.status).toBe(302);
        const location = new URL(header(response, "location"));
        expect(location.origin + location.pathname).toBe(
            "https://enter.pollinations.ai/authorize",
        );
        expect(location.searchParams.get("client_id")).toBe("pk_mcp_app");
        expect(location.searchParams.get("redirect_uri")).toBe(
            "https://mcp.pollinations.ai/oauth/callback",
        );
        expect(location.searchParams.get("code_challenge_method")).toBe("S256");
        expect(location.searchParams.has("scope")).toBe(false);
        expect(location.searchParams.has("resource")).toBe(false);
        expect(kv.values.size).toBe(1);
    });

    it("exchanges the Enter code and stores the sk_ only in encrypted props", async () => {
        const { env, kv, oauth } = createEnv();
        const start = await beginAuthorization(
            new Request("https://mcp.pollinations.ai/authorize?client_id=x"),
            env,
        );
        const state = queryParam(new URL(header(start, "location")), "state");
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                access_token: "sk_user_secret",
                token_type: "bearer",
                expires_in: 3600,
            }),
        );

        const response = await finishAuthorization(
            new Request(
                `https://mcp.pollinations.ai/oauth/callback?code=enter-code&state=${state}`,
            ),
            env,
        );

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toContain("code=mcp-code");
        expect(kv.values.size).toBe(0);
        expect(oauth.completeAuthorization).toHaveBeenCalledWith(
            expect.objectContaining({
                request: oauthRequest,
                scope: [],
                metadata: {},
                props: {
                    apiKey: "sk_user_secret",
                    upstreamExpiresIn: 3600,
                },
            }),
        );
        const tokenRequest = vi.mocked(fetch).mock.calls[0];
        expect(String(tokenRequest[0])).toBe(
            "https://enter.pollinations.ai/api/oauth/token",
        );
        expect(String(tokenRequest[1]?.body)).toContain("client_id=pk_mcp_app");
    });

    it("forwards upstream denial to the validated MCP client callback", async () => {
        const { env } = createEnv();
        const start = await beginAuthorization(
            new Request("https://mcp.pollinations.ai/authorize?client_id=x"),
            env,
        );
        const state = queryParam(new URL(header(start, "location")), "state");

        const response = await finishAuthorization(
            new Request(
                `https://mcp.pollinations.ai/oauth/callback?error=access_denied&state=${state}`,
            ),
            env,
        );
        const location = new URL(header(response, "location"));
        expect(location.origin + location.pathname).toBe(
            "http://127.0.0.1:5555/callback",
        );
        expect(location.searchParams.get("error")).toBe("access_denied");
        expect(location.searchParams.get("state")).toBe("client-state");
    });
});
