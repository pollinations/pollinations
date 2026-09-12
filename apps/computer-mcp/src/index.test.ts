import { SELF } from "cloudflare:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import {
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";

const MCP_URL = "https://mcp.internal/";

let client: Client | undefined;
let lastResponse: Response | undefined;

afterEach(async () => {
    await client?.close();
    client = undefined;
});

async function connect(userId: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: async (input, init = {}) => {
            const headers = new Headers(init.headers);
            headers.set(MCP_USER_ID_HEADER, userId);
            lastResponse = await SELF.fetch(input, { ...init, headers });
            return lastResponse;
        },
    });
    const next = new Client({ name: "computer-mcp-test", version: "1.0.0" });
    await next.connect(transport);
    client = next;
    return next;
}

async function runCode(mcp: Client, code: string) {
    const result = await mcp.callTool({ name: "code", arguments: { code } });
    return { result, value: readTextResult(result) };
}

describe("Computer Code Mode MCP", () => {
    it("serves health and keeps the container callback private", async () => {
        const health = await SELF.fetch("https://mcp.internal/health");
        expect(health.status).toBe(200);
        expect(await health.text()).toBe("ok\n");

        const internal = await SELF.fetch("https://mcp.internal/api");
        expect(internal.status).toBe(404);
    });

    it("requires the user header set by the gen proxy", async () => {
        const missing = await SELF.fetch(MCP_URL, { method: "POST" });
        expect(missing.status).toBe(401);

        const get = await SELF.fetch(MCP_URL, {
            headers: { [MCP_USER_ID_HEADER]: "user-get" },
        });
        expect(get.status).toBe(405);
        expect(get.headers.get("allow")).toBe("POST");
    });

    it("exposes durable Computer tools through one Code Mode tool", async () => {
        const mcp = await connect("user-code");

        const listed = await mcp.listTools();
        expect(listed.tools.map((tool) => tool.name)).toEqual(["code"]);
        expect(lastResponse?.headers.has(MCP_USAGE_HEADERS.cost)).toBe(false);
        const description = listed.tools[0]?.description;
        expect(description).toContain("codemode.read");
        expect(description).toContain('"worker-shell"');
        expect(description).toContain('"container-shell"');

        const { result, value } = await runCode(
            mcp,
            `async () => {
          await codemode.write({ path: "/workspace/message.txt", content: "hello" });
          await codemode.edit({
            path: "/workspace/message.txt",
            edits: [{ oldText: "hello", newText: "hello from Code Mode" }]
          });
          const file = await codemode.read({ path: "/workspace/message.txt" });
          const listing = await codemode.ls({ path: "/workspace" });
          const shell = await codemode.exec({ command: "pwd" });
          return {
            content: file.content,
            listed: listing.entries.some((entry) => entry.name === "message.txt"),
            backend: shell.backend,
            cwd: shell.stdout.trim()
          };
        }`,
        );
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        expect(value).toEqual({
            content: "hello from Code Mode",
            listed: true,
            backend: "worker-shell",
            cwd: "/workspace",
        });
        const receipt = lastResponse?.headers;
        expect(receipt?.get(MCP_USAGE_HEADERS.cost)).toBe("0.0002");
        expect(receipt?.get(MCP_USAGE_HEADERS.tool)).toBe("code");
        expect(receipt?.get(MCP_USAGE_HEADERS.adjustmentId)).toBe(
            "computer.tool_call.v1",
        );
        expect(receipt?.get(MCP_USAGE_HEADERS.adjustmentUnits)).toBe("1");

        const outbound = await runCode(
            mcp,
            `async () => {
          const response = await fetch("https://example.com");
          return response.status;
        }`,
        );
        expect(outbound.result.isError).toBe(true);
    });

    it("persists per user and isolates users from each other", async () => {
        const alice = await connect("user-alice");
        await runCode(
            alice,
            `async () => codemode.write({ path: "/workspace/secret.txt", content: "alice only" })`,
        );
        await alice.close();

        const aliceAgain = await connect("user-alice");
        const persisted = await runCode(
            aliceAgain,
            `async () => (await codemode.read({ path: "/workspace/secret.txt" })).content`,
        );
        expect(persisted.value).toBe("alice only");
        await aliceAgain.close();

        const bob = await connect("user-bob");
        const listing = await runCode(
            bob,
            `async () => (await codemode.ls({ path: "/workspace" })).entries.map((e) => e.name)`,
        );
        expect(listing.value).not.toContain("secret.txt");
    });
});

function readTextResult(result: Awaited<ReturnType<Client["callTool"]>>) {
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((item) => item.type === "text");
    if (!text?.text) throw new Error("Expected a text MCP result.");
    try {
        return JSON.parse(text.text) as unknown;
    } catch {
        return text.text;
    }
}
