// Configuration for no-code prompt agents. Enter owns their persisted
// configuration; Gen owns execution.
import {
    BuiltinMcpServerIdSchema,
    PromptAgentConfigSchema,
    PromptAgentInputSchema,
    type PromptAgentListingPayload,
} from "@shared/community-endpoints.ts";

export { BuiltinMcpServerIdSchema, PromptAgentInputSchema };
export type PromptAgentConfig = PromptAgentListingPayload;
export type PromptAgentInput = PromptAgentListingPayload;

export function promptAgentApiBaseUrl(env: { GEN_BASE_URL: string }): string {
    return `${env.GEN_BASE_URL.replace(/\/+$/, "")}/v1`;
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
