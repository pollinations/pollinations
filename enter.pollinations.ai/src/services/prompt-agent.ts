// Configuration for no-code prompt agents. All agents run in the shared Enter
// Worker; the agent row selects the prompt, model, and available MCP tools.
import { normalizeCommunityEndpointBaseUrl } from "@shared/community-endpoints.ts";
import { z } from "zod";

const McpServerUrlSchema = z
    .string()
    .url()
    .refine((value) => {
        try {
            normalizeCommunityEndpointBaseUrl(value);
            return true;
        } catch {
            return false;
        }
    }, "MCP server URL must use https and target a public host")
    .transform(normalizeCommunityEndpointBaseUrl);

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
    url: McpServerUrlSchema,
});

export const PromptAgentSchema = z
    .object({
        systemPrompt: z.string().trim().min(1).max(8000),
        baseModel: z.string().trim().min(1).max(253),
        pollinationsTools: z.boolean().optional().default(false),
        mcpServers: z.array(McpServerSchema).max(8).optional().default([]),
    })
    .superRefine((config, context) => {
        const names = new Set(config.pollinationsTools ? ["pollinations"] : []);
        for (const [index, server] of config.mcpServers.entries()) {
            if (!names.has(server.name)) {
                names.add(server.name);
                continue;
            }
            context.addIssue({
                code: "custom",
                path: ["mcpServers", index, "name"],
                message: `MCP server name "${server.name}" is already in use`,
            });
        }
    })
    .describe(
        "No-code agent config: a system prompt over a base model, with optional MCP servers. The platform runs it; no worker source or bearerToken is needed.",
    );

export type PromptAgentConfig = z.infer<typeof PromptAgentSchema>;

export function agentRuntimeBaseUrl(env: {
    AGENT_RUNTIME_BASE_URL: string;
}): string {
    return env.AGENT_RUNTIME_BASE_URL;
}

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
