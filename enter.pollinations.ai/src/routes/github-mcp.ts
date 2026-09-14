import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

// A small, read-only subset of GitHub's hosted MCP. Keep permissions here,
// not in caller-controlled headers or agent configuration.
const GITHUB_TOOLS = [
    "get_file_contents",
    "search_code",
    "search_repositories",
    "list_branches",
    "list_commits",
    "get_commit",
    "issue_read",
    "search_issues",
    "pull_request_read",
    "search_pull_requests",
].join(",");

export const githubMcpRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: false }))
    .on(["GET", "POST", "DELETE"], "/", async (c) => {
        const user = c.var.auth.requireUser();
        // Public app keys are shareable, not consent to read their owner's
        // repositories. Agent tokens retain the parent key's trusted metadata.
        if (c.var.auth.apiKey?.metadata?.keyType !== "secret") {
            throw new HTTPException(403, {
                message:
                    "GitHub MCP requires a secret key or an agent token derived from one.",
            });
        }
        let accessToken: string;
        try {
            const token = await c.var.auth.client.api.getAccessToken({
                body: {
                    providerId: "github-app",
                    accountId: String(user.githubId),
                    userId: user.id,
                },
            });
            accessToken = token.accessToken;
            if (!accessToken) throw new Error("GitHub token unavailable");
        } catch {
            throw new HTTPException(403, {
                message:
                    "Connect GitHub repositories in your account settings to use this MCP.",
            });
        }

        // Only forward MCP transport headers. Pollinations keys, cookies, user
        // IDs, URL query parameters, and caller tool overrides stay here.
        const headers = new Headers({
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json, text/event-stream",
            "X-MCP-Tools": GITHUB_TOOLS,
            "X-MCP-Readonly": "true",
        });
        for (const name of [
            "content-type",
            "mcp-protocol-version",
            "mcp-session-id",
            "last-event-id",
        ]) {
            const value = c.req.header(name);
            if (value) headers.set(name, value);
        }

        const response = await fetch("https://api.githubcopilot.com/mcp/", {
            method: c.req.method,
            headers,
            body: c.req.method === "POST" ? c.req.raw.body : undefined,
            redirect: "manual",
            signal: c.req.raw.signal,
        }).catch(() => {
            throw new HTTPException(502, {
                message: "GitHub MCP is unavailable",
            });
        });
        if (response.status >= 300 && response.status < 400) {
            throw new HTTPException(502, {
                message: "GitHub MCP returned a redirect",
            });
        }
        const responseHeaders = new Headers({ "Cache-Control": "no-store" });
        for (const name of ["content-type", "mcp-session-id", "retry-after"]) {
            const value = response.headers.get(name);
            if (value) responseHeaders.set(name, value);
        }
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    });
