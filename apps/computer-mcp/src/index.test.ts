import { env, SELF } from "cloudflare:test";
import { getWorkspace } from "@cloudflare/computer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import {
    MCP_AGENT_ID_HEADER,
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";

const MCP_URL = "https://mcp.internal/";
let lastResponse: Response | undefined;

async function connect(userId: string, agentId?: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: async (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set(MCP_USER_ID_HEADER, userId);
            if (agentId) headers.set(MCP_AGENT_ID_HEADER, agentId);
            lastResponse = await SELF.fetch(input, { ...init, headers });
            return lastResponse;
        },
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);
    return client;
}

describe("computer MCP worker", () => {
    it("answers health without a user", async () => {
        const response = await SELF.fetch("https://mcp.internal/health");
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("ok\n");
    });

    it("rejects requests without the user header", async () => {
        const response = await SELF.fetch(MCP_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        });
        expect(response.status).toBe(401);
    });

    it("discovers tools without starting a container or billing", async () => {
        const client = await connect("user-tools");
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toEqual([
            "bash",
            "publish_file",
        ]);
        const properties = tools[0]?.inputSchema.properties ?? {};
        expect(properties).not.toHaveProperty("mode");
        expect(properties).not.toHaveProperty("cwd");
        expect(properties).toHaveProperty("workspace");
        expect(lastResponse?.headers.has(MCP_USAGE_HEADERS.cost)).toBe(false);
        await client.close();
    });

    it("publishes from the selected agent workspace through real media storage", async () => {
        const client = await connect("user-publish", "agent-one");
        const workspace = await getWorkspace(
            env.COMPUTER.get(
                env.COMPUTER.idFromName(
                    "user:user-publish:agent:agent-one:workspace:report",
                ),
            ) as unknown as Parameters<typeof getWorkspace>[0],
        );
        const html = "<h1>héllo — “quotes”</h1>\n";
        await workspace.fs.mkdir("/workspace", { recursive: true });
        await workspace.fs.writeFile("/workspace/report.html", html);
        const published = await client.callTool({
            name: "publish_file",
            arguments: { path: "/workspace/report.html", workspace: "report" },
        });
        expect(published.isError, JSON.stringify(published.content)).not.toBe(
            true,
        );
        const content = published.content as { type: string; text: string }[];
        const url = content[0].text;
        expect(url).toMatch(
            /^https:\/\/media\.pollinations\.ai\/[0-9a-f-]{36}$/,
        );
        const stored = await env.MEDIA.get(url.slice(url.lastIndexOf("/") + 1));
        expect(stored?.headers.get("content-type")).toBe(
            "text/html; charset=utf-8",
        );
        expect(await stored?.text()).toBe(html);
        expect(lastResponse?.headers.get(MCP_USAGE_HEADERS.cost)).toBe(
            "0.0002",
        );
        expect(lastResponse?.headers.get(MCP_USAGE_HEADERS.tool)).toBe(
            "publish_file",
        );

        for (const [user, agent] of [
            ["user-publish", "agent-two"],
            ["user-publish", undefined],
            ["other-user", "agent-one"],
        ] as const) {
            const other = await connect(user, agent);
            const result = await other.callTool({
                name: "publish_file",
                arguments: {
                    path: "/workspace/report.html",
                    workspace: "report",
                },
            });
            expect(result.isError).toBe(true);
            await other.close();
        }
        await client.close();
    });

    it("rejects invalid workspaces before executing commands", async () => {
        const client = await connect("user-invalid");
        const result = await client.callTool({
            name: "bash",
            arguments: {
                command: "touch should-not-exist",
                workspace: "../escape",
            },
        });
        expect(result.isError).toBe(true);
        await client.close();
    });
});
