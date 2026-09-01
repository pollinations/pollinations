// Configuration for no-code prompt agents. All agents run in the shared Enter
// Worker; the agent row selects the prompt, model, and attached MCP servers.
import {
    BuiltinMcpServerIdSchema,
    OptiLLMConfigSchema,
    PromptAgentConfigSchema,
    PromptAgentInputSchema,
    type PromptAgentListingPayload,
} from "@shared/community-endpoints.ts";

export {
    BuiltinMcpServerIdSchema,
    OptiLLMConfigSchema,
    PromptAgentInputSchema,
};
export type PromptAgentConfig = PromptAgentListingPayload;
export type PromptAgentInput = PromptAgentListingPayload;

export function agentRuntimeBaseUrl(env: {
    AGENT_RUNTIME_BASE_URL: string;
}): string {
    return env.AGENT_RUNTIME_BASE_URL;
}

export function parsePromptAgentConfig(raw: string): PromptAgentConfig | null {
    try {
        const parsed = PromptAgentConfigSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function serializePromptAgentConfig(config: PromptAgentConfig): string {
    return JSON.stringify(PromptAgentConfigSchema.parse(config));
}
