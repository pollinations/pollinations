// The prompt runtime is Enter-specific. Agent config schemas are shared with
// gen so both services interpret the persisted kind and config identically.
export {
    BuiltinMcpServerIdSchema,
    type PromptAgentConfig,
    PromptAgentConfigSchema as PromptAgentSchema,
    PromptAgentInputSchema,
} from "@shared/agent-config.ts";

import {
    type PromptAgentConfig,
    PromptAgentConfigSchema,
} from "@shared/agent-config.ts";

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
