import { handleAgentResponsesRequest } from "@shared/agents/responses.ts";
import { CreateResponseRequestSchema } from "@shared/schemas/openai.ts";
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

export function handlePromptAgentResponsesRequest(
    request: PromptAgentResponsesRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    return handleAgentResponsesRequest(
        request,
        signal,
        ({ messages, settings, signal, stream, onPart, tools }) => {
            const run = stream ? streamPromptAgent : runPromptAgent;
            // The agent's MCP tools are connected per run, next to these.
            return run(runtime, messages, signal, onPart, settings, tools);
        },
    );
}
