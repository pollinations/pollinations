import { z } from "zod";

const ItemStatusSchema = z.enum(["in_progress", "completed", "incomplete"]);

export const ResponseFunctionCallSchema = z.object({
    type: z.literal("function_call"),
    id: z.string().min(1).optional(),
    call_id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string(),
    status: ItemStatusSchema.optional(),
});

export const ResponseFunctionCallOutputSchema = z.object({
    type: z.literal("function_call_output"),
    id: z.string().min(1).optional(),
    call_id: z.string().min(1),
    output: z.string(),
    status: ItemStatusSchema.optional(),
});

export type ResponseFunctionCall = z.infer<typeof ResponseFunctionCallSchema>;
export type ResponseFunctionCallOutput = z.infer<
    typeof ResponseFunctionCallOutputSchema
>;

/** A returned result means the server, not the Chat client, executed the call. */
export function completedFunctionCalls(output: Record<string, unknown>[]) {
    const calls = new Map<string, ResponseFunctionCall>();
    const results = new Map<string, ResponseFunctionCallOutput>();
    for (const item of output) {
        if (item.type === "function_call") {
            const call = ResponseFunctionCallSchema.parse(item);
            if (calls.has(call.call_id))
                throw new Error("Duplicate function call");
            calls.set(call.call_id, call);
        } else if (item.type === "function_call_output") {
            const result = ResponseFunctionCallOutputSchema.parse(item);
            if (result.status && result.status !== "completed")
                throw new Error("Incomplete function result");
            if (results.has(result.call_id))
                throw new Error("Duplicate function result");
            results.set(result.call_id, result);
        }
    }
    for (const callId of results.keys()) {
        const call = calls.get(callId);
        if (!call || (call.status && call.status !== "completed"))
            throw new Error("Function result has no completed matching call");
    }
    return { calls, results };
}
