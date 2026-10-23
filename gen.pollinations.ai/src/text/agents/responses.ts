import {
    AgentResponsesRequestError,
    agentResponsesError,
    handleAgentResponsesRequest,
} from "@shared/agents/responses.ts";
import { CreateResponseRequestSchema } from "@shared/schemas/openai.ts";
import { jsonSchema, type ToolSet } from "ai";
import { z } from "zod";
import {
    type PromptAgentRuntime,
    runPromptAgent,
    streamPromptAgent,
} from "./runtime.ts";

export const PromptAgentResponsesRequestSchema =
    CreateResponseRequestSchema.extend({ model: z.string().uuid() });

export type PromptAgentResponsesRequest = z.output<
    typeof PromptAgentResponsesRequestSchema
>;

export async function handlePromptAgentResponsesRequest(
    request: PromptAgentResponsesRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    const callerTools: ToolSet = Object.create(null);
    for (const definition of request.tools ?? []) {
        if (
            !/^[a-zA-Z0-9_-]{1,64}$/.test(definition.name) ||
            definition.name.startsWith("mcp__") ||
            Object.hasOwn(callerTools, definition.name)
        ) {
            return agentResponsesError(
                new AgentResponsesRequestError(
                    "Caller tool names must be unique, use 1–64 letters, digits, underscores or hyphens, and not start with mcp__",
                    "tools",
                ),
            );
        }
        // No execute: the SDK returns these calls for the client to fulfill.
        callerTools[definition.name] = {
            description: definition.description,
            inputSchema: jsonSchema(
                definition.parameters ?? { type: "object", properties: {} },
            ),
            ...(definition.strict == null ? {} : { strict: definition.strict }),
        };
    }
    return handleAgentResponsesRequest(
        request,
        signal,
        ({ messages, settings, signal, stream, onPart }) => {
            const run = stream ? streamPromptAgent : runPromptAgent;
            return run(
                runtime,
                messages,
                signal,
                onPart,
                settings,
                callerTools,
            );
        },
        callerTools,
    );
}
