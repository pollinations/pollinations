import { env, SELF } from "cloudflare:test";
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

async function bash(
    client: Client,
    command: string,
    stdin?: string,
    cwd?: string,
): Promise<{ text: string; isError: boolean }> {
    const result = await client.callTool({
        name: "bash",
        arguments: { command, stdin, cwd },
    });
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

    it("exposes a single bash tool", async () => {
        const client = await connect("user-tools");
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toEqual(["bash"]);
        expect(lastResponse?.headers.has(MCP_USAGE_HEADERS.cost)).toBe(false);
        await client.close();
    });

    it("reports a flat usage receipt per call", async () => {
        const client = await connect("user-billing");
        await bash(client, "ls /workspace");
        const headers = lastResponse?.headers;
        expect(headers?.get(MCP_USAGE_HEADERS.cost)).toBe("0.0002");
        expect(headers?.get(MCP_USAGE_HEADERS.tool)).toBe("bash");
        expect(headers?.get(MCP_USAGE_HEADERS.status)).toBe("200");
        expect(headers?.get(MCP_USAGE_HEADERS.adjustmentId)).toBe(
            "computer.tool_call.v1",
        );
        expect(headers?.get(MCP_USAGE_HEADERS.adjustmentUnits)).toBe("1");
        await client.close();
    });

    it("seeds a README that explains the memory convention", async () => {
        const client = await connect("user-readme");
        const readme = await bash(client, "cat /workspace/README.md");
        expect(readme.isError).toBe(false);
        expect(readme.text).toContain("/workspace/memory/facts.md");
        await client.close();
    });

    it("writes files from stdin that persist across connections", async () => {
        const client = await connect("user-files");
        const write = await bash(
            client,
            "cat > /workspace/memory/facts.md",
            "favourite colour: 'blue' $HOME `date`\n",
        );
        expect(write.isError).toBe(false);
        const edit = await bash(
            client,
            "sed -i s/blue/green/ /workspace/memory/facts.md",
        );
        expect(edit.isError).toBe(false);
        await client.close();

        const again = await connect("user-files");
        const read = await bash(again, "grep -r green /workspace/memory");
        expect(read.text).toContain(
            "facts.md:favourite colour: 'green' $HOME `date`",
        );
        await again.close();
    });

    it("reports stderr and non-zero exit codes as errors", async () => {
        const client = await connect("user-errors");
        const result = await bash(client, "cat /workspace/missing.txt");
        expect(result.isError).toBe(true);
        expect(result.text).toContain("[stderr]");
        expect(result.text).toContain("[exit code 1]");
        await client.close();
    });

    it("keeps users isolated", async () => {
        const alice = await connect("user-alice");
        await bash(alice, "echo 'alice only' > /workspace/secret.txt");
        await alice.close();

        const bob = await connect("user-bob");
        const ls = await bash(bob, "ls /workspace");
        expect(ls.text).not.toContain("secret.txt");
        await bob.close();
    });

    it("creates the cwd folder and keeps projects on one computer", async () => {
        const client = await connect("user-projects");
        const write = await bash(
            client,
            "echo 'thesis plan' > plan.md",
            undefined,
            "/workspace/thesis",
        );
        expect(write.isError).toBe(false);
        const ls = await bash(
            client,
            "ls /workspace/thesis && cat ../README.md | head -1",
            undefined,
            "/workspace/thesis",
        );
        expect(ls.text).toContain("plan.md");
        expect(ls.text).toContain("# Your computer");
        await client.close();
    });

    it("shares /public between users and keeps it apart from /workspace", async () => {
        const alice = await connect("user-public-alice");
        const write = await bash(
            alice,
            "echo 'from alice' > /public/notes/hello.md && cat /public/README.md | head -1",
            undefined,
            "/public/notes",
        );
        expect(write.isError).toBe(false);
        expect(write.text).toContain("# The public computer");
        const alicePrivate = await bash(alice, "ls /public");
        expect(alicePrivate.isError).toBe(true);
        await alice.close();

        const bob = await connect("user-public-bob");
        const read = await bash(
            bob,
            "cat hello.md && ls /workspace",
            undefined,
            "/public/notes",
        );
        expect(read.text).toContain("from alice");
        expect(read.text).not.toContain("README.md");
        await bob.close();
    });

    it("rejects a relative cwd", async () => {
        const client = await connect("user-cwd");
        await expect(
            client.callTool({
                name: "bash",
                arguments: { command: "ls", cwd: "notes" },
            }),
        ).rejects.toThrow(/cwd must be an absolute path/);
        await client.close();
    });

    it("publishes a file to media storage with assets publish", async () => {
        const client = await connect("user-publish");
        const html = "<h1>hello</h1>\n";
        await bash(client, "cat > /workspace/report.html", html);
        const publish = await bash(
            client,
            "assets publish /workspace/report.html",
        );
        expect(publish.isError).toBe(false);
        const url = publish.text.trim();
        expect(url).toMatch(
            /^https:\/\/media\.pollinations\.ai\/[0-9a-f-]{36}$/,
        );
        const stored = await env.MEDIA.get(url.slice(url.lastIndexOf("/") + 1));
        expect(stored?.headers.get("content-type")).toBe(
            "text/html; charset=utf-8",
        );
        expect(await stored?.text()).toBe(html);
        await client.close();
    });

    it("downloads files with curl", async () => {
        const client = await connect("user-curl");
        const download = await bash(
            client,
            "curl -sS -o /workspace/example.html https://example.com/ && grep -c 'Example Domain' /workspace/example.html",
        );
        expect(download.isError).toBe(false);
        expect(download.text.trim()).toBe("1");
        await client.close();
    });

    it("runs pipelines, jq and git", async () => {
        const client = await connect("user-shell");
        const result = await bash(
            client,
            [
                "cd /workspace",
                "printf 'one\\ntwo\\nthree\\n' > notes.txt",
                "wc -l < notes.txt",
                "echo '{\"a\":[1,2,3]}' | jq -c '.a | length'",
                "git init . >/dev/null && git add notes.txt && git commit -m init >/dev/null && git log --oneline | wc -l",
            ].join(" && "),
        );
        expect(result.text.split("\n").map((line) => line.trim())).toEqual([
            "3",
            "3",
            "1",
            "",
        ]);
        expect(result.isError).toBe(false);
        await client.close();
    });
});
