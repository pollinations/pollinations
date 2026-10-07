import { z } from "zod";
import {
    type FunctionCall,
    FunctionCallOutputSchema,
    FunctionCallSchema,
    parseFunctionName,
} from "./function-items.ts";
import { safeMcpOutput } from "./mcp-output.ts";
import type { AgentPart } from "./types.ts";

const MessageSchema = z.object({
    type: z.literal("message"),
    id: z.string(),
    role: z.literal("assistant"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    content: z.array(
        z.object({
            type: z.literal("output_text"),
            text: z.string(),
            annotations: z.array(z.unknown()),
            logprobs: z.array(z.unknown()),
        }),
    ),
});
const ReasoningSchema = z.object({
    type: z.literal("reasoning"),
    id: z.string(),
    summary: z.array(
        z.object({ type: z.literal("summary_text"), text: z.string() }),
    ),
});
const OutputItemSchema = z.discriminatedUnion("type", [
    ReasoningSchema,
    MessageSchema,
    FunctionCallSchema,
    FunctionCallOutputSchema,
]);
export type AgentOutputItem = z.infer<typeof OutputItemSchema>;

/** One ordered output collector serves JSON responses and streaming events. */
export function collectOutput(
    send?: (type: string, payload: Record<string, unknown>) => void,
) {
    const items: AgentOutputItem[] = [];
    const skippedToolCalls = new Set<string>();
    const pendingCalls = new Map<string, FunctionCall>();
    const callIds = new Set<string>();
    let message: z.infer<typeof MessageSchema> | undefined;
    let reasoning: z.infer<typeof ReasoningSchema> | undefined;
    const closeReasoning = () => {
        if (!reasoning) return;
        const position = {
            item_id: reasoning.id,
            output_index: items.indexOf(reasoning),
            summary_index: 0,
        };
        send?.("response.reasoning_summary_text.done", {
            ...position,
            text: reasoning.summary[0].text,
        });
        send?.("response.reasoning_summary_part.done", {
            ...position,
            part: reasoning.summary[0],
        });
        send?.("response.output_item.done", {
            output_index: position.output_index,
            item: reasoning,
        });
        reasoning = undefined;
    };
    const closeMessage = (status: "completed" | "incomplete" = "completed") => {
        if (!message) return;
        message.status = status;
        const position = {
            item_id: message.id,
            output_index: items.indexOf(message),
            content_index: 0,
        };
        send?.("response.output_text.done", {
            ...position,
            text: message.content[0].text,
            logprobs: [],
        });
        send?.("response.content_part.done", {
            ...position,
            part: message.content[0],
        });
        send?.("response.output_item.done", {
            output_index: position.output_index,
            item: message,
        });
        message = undefined;
    };
    return {
        items,
        onPart(part: AgentPart) {
            if (part.type === "reasoning-delta") {
                if (!part.text) return;
                if (!reasoning) {
                    closeMessage();
                    reasoning = {
                        type: "reasoning",
                        id: `rs_${crypto.randomUUID()}`,
                        summary: [],
                    };
                    items.push(reasoning);
                    const output_index = items.length - 1;
                    send?.("response.output_item.added", {
                        output_index,
                        item: reasoning,
                    });
                    reasoning.summary.push({ type: "summary_text", text: "" });
                    send?.("response.reasoning_summary_part.added", {
                        item_id: reasoning.id,
                        output_index,
                        summary_index: 0,
                        part: reasoning.summary[0],
                    });
                }
                reasoning.summary[0].text += part.text;
                send?.("response.reasoning_summary_text.delta", {
                    item_id: reasoning.id,
                    output_index: items.indexOf(reasoning),
                    summary_index: 0,
                    delta: part.text,
                });
                return;
            }
            if (part.type === "text-delta") {
                if (!part.text) return;
                closeReasoning();
                if (!message) {
                    message = {
                        id: `msg_${crypto.randomUUID()}`,
                        type: "message",
                        role: "assistant",
                        status: "in_progress",
                        content: [],
                    };
                    items.push(message);
                    send?.("response.output_item.added", {
                        output_index: items.length - 1,
                        item: message,
                    });
                    message.content.push({
                        type: "output_text",
                        text: "",
                        annotations: [],
                        logprobs: [],
                    });
                    send?.("response.content_part.added", {
                        item_id: message.id,
                        output_index: items.length - 1,
                        content_index: 0,
                        part: message.content[0],
                    });
                }
                message.content[0].text += part.text;
                send?.("response.output_text.delta", {
                    item_id: message.id,
                    output_index: items.indexOf(message),
                    content_index: 0,
                    delta: part.text,
                    logprobs: [],
                });
                return;
            }
            if (part.type === "tool-call") {
                // The SDK feeds invalid attempts back to the model for recovery;
                // they never executed an MCP tool and are not public call history.
                if (part.invalid) {
                    skippedToolCalls.add(part.toolCallId);
                    return;
                }
                closeReasoning();
                closeMessage();
                if (callIds.has(part.toolCallId)) {
                    throw new Error("Agent reused a tool call ID");
                }
                callIds.add(part.toolCallId);
                const item = FunctionCallSchema.parse({
                    type: "function_call",
                    id: `fc_${crypto.randomUUID()}`,
                    call_id: part.toolCallId,
                    name: part.toolName,
                    arguments: JSON.stringify(part.input ?? {}),
                    status: "completed",
                });
                pendingCalls.set(part.toolCallId, item);
                items.push(item);
                const position = {
                    item_id: item.id,
                    output_index: items.length - 1,
                };
                send?.("response.output_item.added", {
                    output_index: position.output_index,
                    item: { ...item, arguments: "", status: "in_progress" },
                });
                send?.("response.function_call_arguments.delta", {
                    ...position,
                    delta: item.arguments,
                });
                send?.("response.function_call_arguments.done", {
                    ...position,
                    arguments: item.arguments,
                });
                send?.("response.output_item.done", {
                    output_index: position.output_index,
                    item,
                });
                return;
            }
            if (skippedToolCalls.delete(part.toolCallId)) return;
            const call = pendingCalls.get(part.toolCallId);
            if (!call) {
                throw new Error("Agent tool result has no matching call");
            }
            pendingCalls.delete(part.toolCallId);
            closeMessage();
            const result =
                part.type === "tool-error"
                    ? {
                          isError: true,
                          content: [
                              {
                                  type: "text",
                                  text:
                                      part.error instanceof Error
                                          ? part.error.message
                                          : String(part.error),
                              },
                          ],
                      }
                    : parseFunctionName(call.name)
                      ? safeMcpOutput(part.output)
                      : (part.output ?? null);
            const item = FunctionCallOutputSchema.parse({
                type: "function_call_output",
                id: `fco_${crypto.randomUUID()}`,
                call_id: call.call_id,
                // Content parts rather than a bare string: Open WebUI iterates
                // the output of every function_call_output item it receives.
                output: [{ type: "input_text", text: JSON.stringify(result) }],
                status: "completed",
            });
            items.push(item);
            const output_index = items.length - 1;
            send?.("response.output_item.added", {
                output_index,
                item: { ...item, output: [], status: "in_progress" },
            });
            send?.("response.output_item.done", { output_index, item });
        },
        finish(
            finishReason: string,
            callerTools: ReadonlySet<string> = new Set(),
        ): AgentOutputItem[] {
            if (
                [...pendingCalls.values()].some(
                    (call) => !callerTools.has(call.name),
                )
            ) {
                throw new Error("Agent tool call has no result");
            }
            closeReasoning();
            closeMessage(
                finishReason === "length" || finishReason === "content_filter"
                    ? "incomplete"
                    : "completed",
            );
            return z.array(OutputItemSchema).parse(items);
        },
    };
}
