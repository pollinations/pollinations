import type { ModelMessage, ToolLoopAgent, ToolSet } from "ai";
import type { AgentPart } from "./types.ts";

/** Forward SDK output; the caller owns configuration, cleanup, and stop policy. */
export async function runSdkAgent<TOOLS extends ToolSet>(
    agent: ToolLoopAgent<never, TOOLS>,
    {
        messages,
        signal,
        stream,
        onPart,
    }: {
        messages: ModelMessage[];
        signal: AbortSignal;
        stream: boolean;
        onPart: (part: AgentPart) => void;
    },
) {
    if (stream) {
        const result = await agent.stream({ messages, abortSignal: signal });
        for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error;
            if (
                part.type === "text-delta" ||
                part.type === "tool-call" ||
                part.type === "tool-result" ||
                part.type === "tool-error"
            ) {
                onPart(part);
            }
        }
        const [finishReason, steps] = await Promise.all([
            result.finishReason,
            result.steps,
        ]);
        return { finishReason, steps };
    }

    const result = await agent.generate({ messages, abortSignal: signal });
    for (const step of result.steps) {
        for (const part of step.content) {
            if (part.type === "text") {
                onPart({ type: "text-delta", text: part.text });
            }
            if (
                part.type === "tool-call" ||
                part.type === "tool-result" ||
                part.type === "tool-error"
            ) {
                onPart(part);
            }
        }
    }
    return { finishReason: result.finishReason, steps: result.steps };
}
