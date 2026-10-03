import { env, SELF } from "cloudflare:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { beforeEach } from "vitest";
import type { Vault } from "./index";

let namespace = crypto.randomUUID();
beforeEach(() => {
    namespace = crypto.randomUUID();
});

export function ownerStub(owner = "hive-owner") {
    const bindings = env as { VAULT: DurableObjectNamespace<Vault> };
    return bindings.VAULT.get(
        bindings.VAULT.idFromName(`user:${namespace}:${owner}`),
    );
}

export async function connect(
    owner = "hive-owner",
    credential = "agent-a",
    permissions = ["read", "write"],
) {
    const client = new Client({ name: "vault-test", version: "1" });
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://mcp.internal/"), {
            fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                headers.set("x-pollinations-user-id", `${namespace}:${owner}`);
                headers.set(
                    "x-pollinations-vault-actor",
                    JSON.stringify([credential, null]),
                );
                headers.set(
                    "x-pollinations-vault-permissions",
                    JSON.stringify(permissions),
                );
                return SELF.fetch(input, { ...init, headers });
            },
        }),
    );
    return client;
}

export async function call(
    name: string,
    args: unknown,
    owner = "hive-owner",
    credential = "agent-a",
    permissions = ["read", "write"],
) {
    const client = await connect(
        owner,
        credential,
        permissions.filter((p) => p !== "search"),
    );
    try {
        const result = await client.callTool({
            name,
            arguments: args as Record<string, unknown>,
        });
        const envelope = result.structuredContent as
            | { data?: Record<string, unknown>; error?: { code: string } }
            | undefined;
        return { result, data: envelope?.data, error: envelope?.error?.code };
    } finally {
        await client.close();
    }
}
