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

const McpHeaderNameSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/, "MCP header name is invalid");
const McpHeaderValueSchema = z
    .string()
    .min(1)
    .max(8192)
    .refine((value) => !value.includes("\r") && !value.includes("\n"), {
        message: "MCP header value cannot contain line breaks",
    });
const McpHeadersInputSchema = z
    .record(McpHeaderNameSchema, McpHeaderValueSchema.nullable())
    .refine((headers) => Object.keys(headers).length <= 16, {
        message: "An MCP server can have at most 16 headers",
    })
    .superRefine((headers, context) => {
        const names = new Set<string>();
        for (const name of Object.keys(headers)) {
            const normalized = name.toLowerCase();
            if (!names.has(normalized)) {
                names.add(normalized);
                continue;
            }
            context.addIssue({
                code: "custom",
                path: [name],
                message: `MCP header name "${name}" is already in use`,
            });
        }
    });

const McpServerBaseSchema = z.object({
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

const McpServerSchema = McpServerBaseSchema.extend({
    // Header names are safe to return; their encrypted values live separately.
    headers: z.array(McpHeaderNameSchema).max(16).optional().default([]),
});

export const McpServerInputSchema = McpServerBaseSchema.extend({
    // Null means "keep the saved value" on update. Values are never returned.
    headers: McpHeadersInputSchema.optional().default({}),
});

function addUniqueMcpServerNameIssues(
    config: { pollinationsTools?: boolean; mcpServers: { name: string }[] },
    context: z.RefinementCtx,
) {
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
}

export const PromptAgentSchema = z
    .object({
        systemPrompt: z.string().trim().min(1).max(8000),
        baseModel: z.string().trim().min(1).max(253),
        pollinationsTools: z.boolean().optional().default(false),
        mcpServers: z.array(McpServerSchema).max(8).optional().default([]),
    })
    .superRefine(addUniqueMcpServerNameIssues)
    .describe(
        "No-code agent config: a system prompt over a base model, with optional MCP servers. The platform runs it; no worker source or bearerToken is needed.",
    );

export const PromptAgentInputSchema = z
    .object({
        systemPrompt: PromptAgentSchema.shape.systemPrompt,
        baseModel: PromptAgentSchema.shape.baseModel,
        pollinationsTools: PromptAgentSchema.shape.pollinationsTools,
        mcpServers: z.array(McpServerInputSchema).max(8).optional().default([]),
    })
    .superRefine(addUniqueMcpServerNameIssues);

export const McpServerResponseSchema = McpServerBaseSchema.extend({
    headers: z.record(McpHeaderNameSchema, z.null()),
});

export type PromptAgentConfig = z.infer<typeof PromptAgentSchema>;
export type PromptAgentInput = z.infer<typeof PromptAgentInputSchema>;
export type PromptAgentMcpHeaders = Record<string, Record<string, string>>;

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

export function parsePromptAgentMcpHeaders(
    raw: string,
): PromptAgentMcpHeaders | null {
    try {
        const parsed = z
            .record(
                z.string(),
                z.record(McpHeaderNameSchema, McpHeaderValueSchema),
            )
            .safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
