import { z } from "zod";
import { ResponseFunctionCallSchema } from "../schemas/response-function-items.ts";

export const FunctionCallSchema = ResponseFunctionCallSchema.required({
    id: true,
    status: true,
});

export type FunctionCall = z.infer<typeof FunctionCallSchema>;

const McpCallErrorSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.enum(["mcp_protocol_error", "http_error"]),
        code: z.number().int(),
        message: z.string(),
    }),
    z.object({
        type: z.literal("mcp_tool_execution_error"),
        content: z.json(),
    }),
]);

export const McpCallSchema = z.object({
    type: z.literal("mcp_call"),
    id: z.string().min(1),
    server_label: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string(),
    status: z
        .enum(["in_progress", "completed", "incomplete", "calling", "failed"])
        .default("completed"),
    output: z.string().nullable().default(null),
    error: McpCallErrorSchema.nullable().default(null),
    approval_request_id: z.string().nullable().default(null),
});

export type McpCall = z.infer<typeof McpCallSchema>;
export type McpCallError = z.infer<typeof McpCallErrorSchema>;

export function parseFunctionName(name: string) {
    const match = /^mcp__(.+?)__(.+)$/.exec(name);
    return match ? { serverLabel: match[1], name: match[2] } : undefined;
}

// Code agents may also run their own functions on the server.
const AGENT_SERVER_LABEL = "agent";

/** Every server-run tool is reported as an mcp_call under its server label. */
export function serverTool(name: string) {
    return parseFunctionName(name) ?? { serverLabel: AGENT_SERVER_LABEL, name };
}

export function serverToolName(call: Pick<McpCall, "server_label" | "name">) {
    return call.server_label === AGENT_SERVER_LABEL
        ? call.name
        : `mcp__${call.server_label}__${call.name}`;
}
