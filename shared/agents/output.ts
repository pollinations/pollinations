import { z } from "zod";
import {
    FunctionCallSchema,
    type McpCall,
    McpCallSchema,
    parseFunctionName,
    serverTool,
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
const OutputItemSchema = z.discriminatedUnion("type", [
    MessageSchema,
    FunctionCallSchema,
    McpCallSchema,
]);
export type AgentOutputItem = z.infer<typeof OutputItemSchema>;

/**
 * One ordered output collector serves JSON responses and streaming events.
 * Caller tools become function calls for the client to run; tools the server
 * runs become mcp_call items that carry their own result.
 */
export function collectOutput(
    callerTools: ReadonlySet<string>,
    send?: (type: string, payload: Record<string, unknown>) => void,
) {
    const items: AgentOutputItem[] = [];
    const skippedToolCalls = new Set<string>();
    const pendingCalls = new Map<string, McpCall>();
    const callIds = new Set<string>();
    let message: z.infer<typeof MessageSchema> | undefined;
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
            if (part.type === "text-delta") {
                if (!part.text) return;
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
                closeMessage();
                if (callIds.has(part.toolCallId)) {
                    throw new Error("Agent reused a tool call ID");
                }
                callIds.add(part.toolCallId);
                const input = JSON.stringify(part.input ?? {});
                if (!callerTools.has(part.toolName)) {
                    const tool = serverTool(part.toolName);
                    const item = McpCallSchema.parse({
                        type: "mcp_call",
                        id: `mcp_${crypto.randomUUID()}`,
                        server_label: tool.serverLabel,
                        name: tool.name,
                        arguments: input,
                        status: "in_progress",
                    });
                    pendingCalls.set(part.toolCallId, item);
                    items.push(item);
                    send?.("response.output_item.added", {
                        output_index: items.length - 1,
                        item,
                    });
                    return;
                }
                const item = FunctionCallSchema.parse({
                    type: "function_call",
                    id: `fc_${crypto.randomUUID()}`,
                    call_id: part.toolCallId,
                    name: part.toolName,
                    arguments: input,
                    status: "completed",
                });
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
            const item = pendingCalls.get(part.toolCallId);
            if (!item) {
                throw new Error("Agent tool result has no matching call");
            }
            pendingCalls.delete(part.toolCallId);
            closeMessage();
            const mcpResult =
                part.type === "tool-result" && parseFunctionName(part.toolName)
                    ? safeMcpOutput(part.output)
                    : undefined;
            if (part.type === "tool-result" && !mcpResult?.isError) {
                item.status = "completed";
                item.output = JSON.stringify(mcpResult ?? part.output ?? null);
            } else {
                item.status = "failed";
                item.error = {
                    type: "mcp_tool_execution_error",
                    content:
                        part.type === "tool-error"
                            ? part.error instanceof Error
                                ? part.error.message
                                : String(part.error)
                            : (mcpResult ?? null),
                };
            }
            send?.("response.output_item.done", {
                output_index: items.indexOf(item),
                item,
            });
        },
        finish(finishReason: string): AgentOutputItem[] {
            if (pendingCalls.size) {
                throw new Error("Agent tool call has no result");
            }
            closeMessage(
                finishReason === "length" || finishReason === "content_filter"
                    ? "incomplete"
                    : "completed",
            );
            return z.array(OutputItemSchema).parse(items);
        },
    };
}
