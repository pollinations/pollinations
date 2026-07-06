// Provisioning for NO-CODE prompt agents. A prompt agent is registered as
// `{ systemPrompt, baseModel, tools, mcpServers }` with no user code: the
// platform deploys the fixed prompt-agent-template worker (reusing the
// source-deploy path) with the config injected as env bindings, and mints a
// dedicated owner sk_ key the template uses for its internal gen/image calls.
//
// The structured config is stored in the endpoint's `source` column as JSON so
// the existing `source !== null` gating drives create-rollback, update-redeploy,
// and delete-cleanup uniformly. The minted key's id is stored alongside so it
// can be removed when the agent is deleted.
import { createApiKeyForUser } from "@shared/auth/api-key-creation.ts";
import { z } from "zod";
import { PROMPT_AGENT_TEMPLATE_SOURCE } from "./prompt-agent-template.ts";

export const PROMPT_AGENT_BUILTIN_TOOLS = ["web_search", "image"] as const;

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
    auth: z.string().min(1).optional(),
});

export const PromptAgentSchema = z
    .object({
        systemPrompt: z.string().trim().min(1).max(8000),
        baseModel: z.string().trim().min(1).max(253),
        tools: z
            .array(z.enum(PROMPT_AGENT_BUILTIN_TOOLS))
            .max(PROMPT_AGENT_BUILTIN_TOOLS.length)
            .optional()
            .default([]),
        mcpServers: z.array(McpServerSchema).max(8).optional().default([]),
    })
    .describe(
        "No-code agent config: a system prompt over a base model, with optional built-in tools and MCP servers. The platform deploys and runs it; no worker source or bearerToken is needed.",
    );

export type PromptAgentConfig = z.infer<typeof PromptAgentSchema>;

// The blob persisted in the endpoint's `source` column. `keyId` lets delete
// remove the minted owner key; the plaintext key itself lives only in the
// deployed worker's binding, never in D1.
type StoredPromptAgent = {
    promptAgent: PromptAgentConfig;
    keyId: string;
};

export function parseStoredPromptAgent(
    source: string | null,
): StoredPromptAgent | null {
    if (!source) return null;
    try {
        const parsed = JSON.parse(source) as Partial<StoredPromptAgent>;
        if (!parsed?.promptAgent || typeof parsed.keyId !== "string") {
            return null;
        }
        return parsed as StoredPromptAgent;
    } catch {
        return null;
    }
}

function serializeStoredPromptAgent(stored: StoredPromptAgent): string {
    return JSON.stringify(stored);
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

// Builds the deploy inputs for a prompt agent: the template source, the secret
// bindings the template reads, and the blob to store in `source`. Mints the
// owner key as a side effect.
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
    storedSource: string;
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
        { name: "SYSTEM_PROMPT", text: input.config.systemPrompt },
        { name: "BASE_MODEL", text: input.config.baseModel },
        { name: "TOOLS_JSON", text: JSON.stringify(input.config.tools) },
        { name: "MCP_JSON", text: JSON.stringify(input.config.mcpServers) },
        { name: "POLLINATIONS_KEY", text: key },
        { name: "GEN_BASE_URL", text: input.genBaseUrl },
    ];
    return {
        source: PROMPT_AGENT_TEMPLATE_SOURCE,
        storedSource: serializeStoredPromptAgent({
            promptAgent: input.config,
            keyId,
        }),
        extraBindings,
        keyId,
    };
}
