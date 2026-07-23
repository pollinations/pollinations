// Configuration and key provisioning for no-code prompt agents. All agents
// run in the shared Enter Worker; the agent row selects the prompt, model, MCP
// servers, and dedicated owner key used for its internal gen calls.
import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { z } from "zod";

const McpServerSchema = z.object({
    // Namespaces the server's tools (mcp__<name>__<tool>); lowercase to match
    // the community tool-name pattern so its fees can be declared.
    name: z
        .string()
        .trim()
        .regex(
            /^[a-z0-9][a-z0-9_-]{0,39}$/,
            "MCP server name must be lowercase alphanumeric with _ or - (max 40 chars)",
        ),
    url: z.string().url(),
});

export const PromptAgentSchema = z
    .object({
        systemPrompt: z.string().trim().min(1).max(8000),
        baseModel: z.string().trim().min(1).max(253),
        mcpServers: z.array(McpServerSchema).max(8).optional().default([]),
    })
    .describe(
        "No-code agent config: a system prompt over a base model, with optional MCP servers. The platform runs it; no worker source or bearerToken is needed.",
    );

export type PromptAgentConfig = z.infer<typeof PromptAgentSchema>;

export function parsePromptAgentConfig(raw: string): PromptAgentConfig | null {
    try {
        const parsed = PromptAgentSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function serializePromptAgentConfig(config: PromptAgentConfig): string {
    return JSON.stringify(config);
}

type AuthClient = Parameters<typeof createApiKeyForUser>[0]["authClient"];

// The key carries no account permissions. It only spends the owner's balance
// on gen calls, exactly like the owner calling the API themselves.
export async function createPromptAgentKey(
    authClient: AuthClient,
    dbBinding: D1Database,
    userId: string,
    agentName: string,
): Promise<{ key: string; keyId: string }> {
    const created = await createApiKeyForUser({
        authClient,
        dbBinding,
        userId,
        name: `prompt-agent:${agentName}`,
        type: "secret",
        allowAccountKeysPermission: false,
        defaultCreatedVia: "prompt-agent",
    });
    return { key: created.key, keyId: created.id };
}
