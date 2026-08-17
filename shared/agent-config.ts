import { z } from "zod";
import { normalizeCommunityEndpointBaseUrl } from "./community-endpoints.ts";

export const AGENT_KINDS = ["prompt", "endpoint"] as const;
export const AgentKindSchema = z.enum(AGENT_KINDS);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const BuiltinMcpServerIdSchema = z.literal("pollinations");

export const PromptAgentConfigSchema = z.object({
    systemPrompt: z.string().trim().min(1).max(8000),
    baseModel: z.string().trim().min(1).max(253),
    mcpServers: z.array(BuiltinMcpServerIdSchema).max(1).optional().default([]),
});
export const PromptAgentInputSchema = PromptAgentConfigSchema.strict();

export const EndpointAgentConfigSchema = z.object({
    baseUrl: z
        .string()
        .url()
        .transform((value, context) => {
            try {
                return normalizeCommunityEndpointBaseUrl(value);
            } catch (error) {
                context.addIssue({
                    code: "custom",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Invalid endpoint URL",
                });
                return z.NEVER;
            }
        }),
    upstreamModel: z.string().trim().min(1).max(253),
});

export const AgentInputSchema = z.discriminatedUnion("kind", [
    PromptAgentConfigSchema.extend({ kind: z.literal("prompt") }).strict(),
    EndpointAgentConfigSchema.extend({ kind: z.literal("endpoint") }).strict(),
]);

export type PromptAgentConfig = z.infer<typeof PromptAgentConfigSchema>;
export type EndpointAgentConfig = z.infer<typeof EndpointAgentConfigSchema>;
export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentConfig = PromptAgentConfig | EndpointAgentConfig;

export function parseAgentConfig(
    kind: "prompt",
    raw: string,
): PromptAgentConfig | null;
export function parseAgentConfig(
    kind: "endpoint",
    raw: string,
): EndpointAgentConfig | null;
export function parseAgentConfig(
    kind: AgentKind,
    raw: string,
): AgentConfig | null;
export function parseAgentConfig(
    kind: AgentKind,
    raw: string,
): AgentConfig | null {
    try {
        const schema =
            kind === "prompt"
                ? PromptAgentConfigSchema
                : EndpointAgentConfigSchema;
        const parsed = schema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export function serializeAgentConfig(input: AgentInput): string {
    const { kind: _kind, ...config } = input;
    return JSON.stringify(config);
}
