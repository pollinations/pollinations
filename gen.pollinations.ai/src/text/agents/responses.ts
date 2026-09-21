import { parseFunctionName } from "@shared/agents/function-items.ts";
import {
    AgentResponsesRequestError,
    agentResponsesError,
    handleAgentResponsesRequest,
} from "@shared/agents/responses.ts";
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

export async function handlePromptAgentResponsesRequest(
    request: PromptAgentResponsesRequest,
    signal: AbortSignal,
    runtime: PromptAgentRuntime,
): Promise<Response> {
    // Prompt agents only expose hosted MCP tools. Reject unsupported history
    // before starting a stream; code agents may replay ordinary SDK tools.
    if (
        Array.isArray(request.input) &&
        request.input.some(
            (item) =>
                item != null &&
                typeof item === "object" &&
                "type" in item &&
                item.type === "function_call" &&
                "name" in item &&
                typeof item.name === "string" &&
                !parseFunctionName(item.name),
        )
    ) {
        return agentResponsesError(
            new AgentResponsesRequestError(
                "Tool history must contain unique completed function calls",
                "input",
            ),
        );
    }
    return handleAgentResponsesRequest(
        request,
        signal,
        ({ messages, settings, signal, stream, onPart }) => {
            const run = stream ? streamPromptAgent : runPromptAgent;
            return run(runtime, messages, signal, onPart, settings);
        },
    );
}
