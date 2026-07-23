// Provisioning for NO-CODE prompt agents. A prompt agent is registered as
// `{ systemPrompt, baseModel, mcpServers }` with no user code: the
// platform deploys the fixed prompt-agent-template worker (reusing the
// source-deploy path) with the config injected as env bindings, and mints a
// dedicated owner sk_ key the template uses for its internal gen calls.
//
// The structured config and deployment metadata are stored on the agent row.
import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { z } from "zod";
import { PROMPT_AGENT_TEMPLATE_SOURCE } from "./prompt-agent-template.ts";

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
        "No-code agent config: a system prompt over a base model, with optional MCP servers. The platform deploys and runs it; no worker source or bearerToken is needed.",
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

// Mints a dedicated owner sk_ key for the agent's internal calls and returns
// the plaintext key (for injection) plus its id (for later deletion). The key
// carries no account permissions — it only spends the owner's balance on
// gen/image calls, exactly like the owner calling the API themselves.
async function mintOwnerKey(
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

export function promptAgentConfigBindings(
    config: PromptAgentConfig,
    genBaseUrl: string,
): { name: string; text: string }[] {
    return [
        { name: "SYSTEM_PROMPT", text: config.systemPrompt },
        { name: "BASE_MODEL", text: config.baseModel },
        { name: "MCP_JSON", text: JSON.stringify(config.mcpServers) },
        { name: "GEN_BASE_URL", text: genBaseUrl },
    ];
}

// Builds the first deployment of an agent and mints its dedicated owner key.
// The plaintext key is injected into the Worker and is never stored in D1.
export async function buildPromptAgentDeploy(input: {
    authClient: AuthClient;
    dbBinding: D1Database;
    userId: string;
    agentName: string;
    config: PromptAgentConfig;
    // The gateway origin the minted key is valid against (this environment's
    // gen). Injected so a staging-minted key calls staging gen, not prod.
    genBaseUrl: string;
}): Promise<{
    source: string;
    serializedConfig: string;
    extraBindings: { name: string; text: string }[];
    keyId: string;
}> {
    const { key, keyId } = await mintOwnerKey(
        input.authClient,
        input.dbBinding,
        input.userId,
        input.agentName,
    );
    const extraBindings = [
        ...promptAgentConfigBindings(input.config, input.genBaseUrl),
        { name: "POLLINATIONS_KEY", text: key },
    ];
    return {
        source: PROMPT_AGENT_TEMPLATE_SOURCE,
        serializedConfig: serializePromptAgentConfig(input.config),
        extraBindings,
        keyId,
    };
}
