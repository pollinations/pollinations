import { SELF } from "cloudflare:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import {
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";

const MCP_URL = "https://mcp.internal/";

let lastResponse: Response | undefined;

async function connect(userId: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: async (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set(MCP_USER_ID_HEADER, userId);
            lastResponse = await SELF.fetch(input, { ...init, headers });
            return lastResponse;
        },
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);
    return client;
}

async function call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string }[];
    const text = content
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n");
    return { text, isError: result.isError === true };
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

    it("exposes plain file and shell tools", async () => {
        const client = await connect("user-tools");
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name).sort()).toEqual(
            ["edit", "exec", "find", "grep", "ls", "read", "write"].sort(),
        );
        expect(lastResponse?.headers.has(MCP_USAGE_HEADERS.cost)).toBe(false);
        await client.close();
    });

    it("reports a flat usage receipt per tool call", async () => {
        const client = await connect("user-billing");
        await call(client, "ls", { path: "/workspace" });
        const headers = lastResponse?.headers;
        expect(headers?.get(MCP_USAGE_HEADERS.cost)).toBe("0.0002");
        expect(headers?.get(MCP_USAGE_HEADERS.tool)).toBe("ls");
        expect(headers?.get(MCP_USAGE_HEADERS.status)).toBe("200");
        expect(headers?.get(MCP_USAGE_HEADERS.adjustmentId)).toBe(
            "computer.tool_call.v1",
        );
        expect(headers?.get(MCP_USAGE_HEADERS.adjustmentUnits)).toBe("1");
        await client.close();
    });

    it("seeds a README that explains the memory convention", async () => {
        const client = await connect("user-readme");
        const readme = await call(client, "read", {
            path: "/workspace/README.md",
        });
        expect(readme.isError).toBe(false);
        expect(readme.text).toContain("/workspace/memory/facts.md");
        await client.close();
    });

    it("writes, edits, reads and greps files that persist across connections", async () => {
        const client = await connect("user-files");
        const write = await call(client, "write", {
            path: "/workspace/memory/facts.md",
            content: "favourite colour: blue\n",
        });
        expect(write.isError).toBe(false);

        const edit = await call(client, "edit", {
            path: "/workspace/memory/facts.md",
            edits: [{ oldText: "blue", newText: "green" }],
        });
        expect(edit.isError).toBe(false);
        await client.close();

        const again = await connect("user-files");
        const read = await call(again, "read", {
            path: "/workspace/memory/facts.md",
        });
        expect(read.text).toContain("favourite colour: green");

        const grep = await call(again, "grep", {
            query: "green",
            path: "/workspace/memory",
        });
        expect(grep.text).toContain("facts.md");
        await again.close();
    });

    it("keeps users isolated", async () => {
        const alice = await connect("user-alice");
        await call(alice, "write", {
            path: "/workspace/secret.txt",
            content: "alice only\n",
        });
        await alice.close();

        const bob = await connect("user-bob");
        const read = await call(bob, "read", { path: "/workspace/secret.txt" });
        expect(read.text).not.toContain("alice only");
        const ls = await call(bob, "ls", { path: "/workspace" });
        expect(ls.text).not.toContain("secret.txt");
        await bob.close();
    });

    it("keeps sessions of one user isolated", async () => {
        const client = await connect("user-sessions");
        await call(client, "write", {
            path: "/workspace/plan.md",
            content: "thesis plan\n",
            session: "thesis",
        });
        const elsewhere = await call(client, "ls", { path: "/workspace" });
        expect(elsewhere.text).not.toContain("plan.md");
        const same = await call(client, "read", {
            path: "/workspace/plan.md",
            session: "thesis",
        });
        expect(same.text).toContain("thesis plan");
        const readme = await call(client, "read", {
            path: "/workspace/README.md",
            session: "thesis",
        });
        expect(readme.isError).toBe(false);
        await expect(
            client.callTool({
                name: "ls",
                arguments: { path: "/workspace", session: "../other" },
            }),
        ).rejects.toThrow(/Invalid session name/);
        await client.close();
    });

    it("runs bash against the persistent filesystem", async () => {
        const client = await connect("user-shell");
        await call(client, "write", {
            path: "/workspace/notes.txt",
            content: "one\ntwo\nthree\n",
        });
        const exec = await call(client, "exec", {
            command:
                "wc -l < /workspace/notes.txt && echo done >> /workspace/notes.txt",
        });
        expect(exec.isError).toBe(false);
        const output = JSON.parse(exec.text) as {
            exitCode: number | null;
            stdout: string;
        };
        expect(output.exitCode).toBe(0);
        expect(output.stdout.trim()).toBe("3");

        const read = await call(client, "read", {
            path: "/workspace/notes.txt",
        });
        expect(read.text).toContain("done");
        await client.close();
    });
});
