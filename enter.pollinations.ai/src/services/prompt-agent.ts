// Configuration for no-code prompt agents. All agents run in the shared Enter
// Worker; the agent row selects the prompt, model, and attached MCP servers.
import { z } from "zod";

export const BuiltinMcpServerIdSchema = z.literal("pollinations");

export const PromptAgentSchema = z
    .object({
        systemPrompt: z.string().trim().min(1).max(8000),
        baseModel: z.string().trim().min(1).max(253),
        mcpServers: z
            .array(BuiltinMcpServerIdSchema)
            .max(1)
            .optional()
            .default([]),
    })
    .describe(
        "No-code agent config: a system prompt over a base model, with optional access to the built-in Pollinations MCP server.",
    );

// Stored configs may still contain unrelated historical fields, which Zod
// strips. New writes are strict so removed fields fail visibly.
export const PromptAgentInputSchema = PromptAgentSchema.strict();

export type PromptAgentConfig = z.infer<typeof PromptAgentSchema>;
export type PromptAgentInput = z.infer<typeof PromptAgentInputSchema>;

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
