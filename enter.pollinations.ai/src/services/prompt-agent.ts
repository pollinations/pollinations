// Configuration for no-code prompt agents. All agents run in the shared Enter
// Worker; the agent row selects the prompt, model, and attached MCP servers.
import {
    BuiltinMcpServerIdSchema,
    PromptAgentConfigSchema,
    type PromptAgentGitHubSource,
    PromptAgentInputSchema,
    type PromptAgentListingPayload,
    PromptAgentListingPayloadSchema,
} from "@shared/community-endpoints.ts";
import type { z } from "zod";

export { BuiltinMcpServerIdSchema, PromptAgentInputSchema };
export type PromptAgentConfig = z.infer<typeof PromptAgentConfigSchema>;
export type PromptAgentInput = z.infer<typeof PromptAgentInputSchema>;

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

export function parsePromptAgentListing(
    raw: string,
): PromptAgentListingPayload | null {
    try {
        const parsed = PromptAgentListingPayloadSchema.safeParse(
            JSON.parse(raw),
        );
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function serializePromptAgentListing(
    config: PromptAgentConfig,
    source?: PromptAgentGitHubSource,
): string {
    return JSON.stringify(
        PromptAgentListingPayloadSchema.parse({
            ...config,
            ...(source ? { source } : {}),
        }),
    );
}
