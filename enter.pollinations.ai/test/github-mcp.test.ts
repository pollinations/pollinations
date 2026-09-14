import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { account } from "@shared/db/better-auth.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { githubMcpRoutes } from "../src/routes/github-mcp.ts";

afterEach(() => vi.unstubAllGlobals());

async function connectedCaller(githubId: number) {
    const caller = await createTestApiKey({ user: { githubId } });
    const accessToken = `mock_github_app_user_token_${githubId}`;
    await drizzle(env.DB)
        .insert(account)
        .values({
            id: crypto.randomUUID(),
            userId: caller.userId,
            providerId: "github-app",
            accountId: String(githubId),
            accessToken,
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    return { ...caller, accessToken };
}

async function request(path = "/", init?: RequestInit) {
    const ctx = createExecutionContext();
    const response = await githubMcpRoutes.request(path, init, env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

describe("GitHub MCP", () => {
    it("is mounted in the Enter API", async () => {
        const caller = await connectedCaller(111);
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, init: RequestInit) => {
                await new Request(input, init).text();
                return Response.json({ result: {} });
            }),
        );
        const response = await SELF.fetch(
            "http://localhost:3000/api/mcp/github",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
            },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ result: {} });
    });

    it("does not follow credential-bearing redirects", async () => {
        const caller = await connectedCaller(111);
        const fetchMock = vi.fn(async (_input: string, init: RequestInit) => {
            expect(init.redirect).toBe("manual");
            return new Response(null, {
                status: 302,
                headers: { Location: "https://untrusted.example/mcp" },
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        const response = await request("/", {
            headers: { Authorization: `Bearer ${caller.key}` },
        });
        expect(response.status).toBe(502);
        expect(response.headers.has("location")).toBe(false);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("returns a gateway error when GitHub cannot be reached", async () => {
        const caller = await connectedCaller(111);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("Network unavailable");
            }),
        );
        const response = await request("/", {
            headers: { Authorization: `Bearer ${caller.key}` },
        });
        expect(response.status).toBe(502);
        expect(await response.text()).toBe("GitHub MCP is unavailable");
    });

    it.each([
        false,
        true,
    ])("uses the caller's connection, including a derived agent token (%s)", async (derived) => {
        await connectedCaller(222);
        const caller = await connectedCaller(111);
        const key = derived
            ? await signAgentRunToken({
                  secret: env.BETTER_AUTH_SECRET,
                  parentApiKeyId: caller.id,
                  parentRequestId: crypto.randomUUID(),
                  managedAgentId: crypto.randomUUID(),
              })
            : caller.key;
        const fetchMock = vi.fn(async (_input: string, _init: RequestInit) =>
            Response.json({ result: {} }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await request("/", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                "x-pollinations-user-id": "another-user",
            },
            body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
        });

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        const [, init] = fetchMock.mock.calls[0];
        expect(new Headers(init.headers).get("authorization")).toBe(
            `Bearer ${caller.accessToken}`,
        );
    });

    it.each([
        false,
        true,
    ])("rejects a publishable key and its derived agent token (%s)", async (derived) => {
        const caller = await connectedCaller(111);
        const publishable = await createTestApiKey({
            userId: caller.userId,
            type: "publishable",
        });
        const key = derived
            ? await signAgentRunToken({
                  secret: env.BETTER_AUTH_SECRET,
                  parentApiKeyId: publishable.id,
                  parentRequestId: crypto.randomUUID(),
              })
            : publishable.key;
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await request("/", {
            headers: { Authorization: `Bearer ${key}` },
        });
        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a connection with a different GitHub identity", async () => {
        const caller = await connectedCaller(111);
        await drizzle(env.DB)
            .update(account)
            .set({ accountId: "222" })
            .where(eq(account.userId, caller.userId));
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await request("/", {
            headers: { Authorization: `Bearer ${caller.key}` },
        });
        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires a connection belonging to the authenticated caller", async () => {
        await connectedCaller(222);
        const caller = await createTestApiKey({ user: { githubId: 111 } });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await request("/", {
            headers: { Authorization: `Bearer ${caller.key}` },
        });
        expect(response.status).toBe(403);
        expect(await response.text()).toContain("Connect GitHub repositories");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const response = await request();
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ["application/json", '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}'],
        [
            "text/event-stream",
            'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n',
        ],
    ])("passes through %s without forwarding caller credentials or policy", async (contentType, body) => {
        const caller = await connectedCaller(111);
        const requestBody = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
        const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
            expect(input).toBe("https://api.githubcopilot.com/mcp/");
            expect(init.method).toBe("POST");
            expect(await new Response(init.body).text()).toBe(requestBody);
            const headers = new Headers(init.headers);
            expect(headers.get("authorization")).toBe(
                `Bearer ${caller.accessToken}`,
            );
            expect(headers.get("x-mcp-readonly")).toBe("true");
            expect(headers.get("x-mcp-tools")).toContain("get_file_contents");
            expect(headers.get("x-mcp-tools")).not.toContain(
                "delete_repository",
            );
            for (const name of [
                "cookie",
                "x-pollinations-user-id",
                "x-mcp-toolsets",
                "x-api-key",
            ]) {
                expect(headers.has(name)).toBe(false);
            }
            expect(headers.get("content-type")).toBe("application/json");
            expect(headers.get("mcp-protocol-version")).toBe("2025-06-18");
            expect(headers.get("mcp-session-id")).toBe("transport-session");
            expect(headers.get("last-event-id")).toBe("event-2");
            return new Response(body, {
                headers: {
                    "Content-Type": contentType,
                    "mcp-session-id": "response-session",
                    "Set-Cookie": "upstream-cookie=not-for-browser",
                },
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await request(
            "/?key=do-not-forward&tools=delete_repository",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    Cookie: "caller-cookie=not-for-github",
                    "Content-Type": "application/json",
                    "mcp-protocol-version": "2025-06-18",
                    "mcp-session-id": "transport-session",
                    "last-event-id": "event-2",
                    "x-pollinations-user-id": "another-user",
                    "x-mcp-tools": "delete_repository",
                    "x-mcp-toolsets": "all",
                    "x-mcp-readonly": "false",
                    "x-api-key": "do-not-forward",
                },
                body: requestBody,
            },
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(body);
        expect(response.headers.get("content-type")).toBe(contentType);
        expect(response.headers.get("mcp-session-id")).toBe("response-session");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([
        401, 403, 429, 503,
    ])("preserves an upstream %s error", async (status) => {
        const caller = await connectedCaller(111);
        const body = '{"error":"upstream failure"}';
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(body, {
                        status,
                        headers: {
                            "Content-Type": "application/json",
                            "Retry-After": "30",
                        },
                    }),
            ),
        );

        const response = await request("/", {
            headers: { Authorization: `Bearer ${caller.key}` },
        });
        expect(response.status).toBe(status);
        expect(await response.text()).toBe(body);
        expect(response.headers.get("retry-after")).toBe("30");
    });
});
