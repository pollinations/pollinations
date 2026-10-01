import type { z } from "zod";
import {
    ResponseFunctionCallOutputSchema,
    ResponseFunctionCallSchema,
} from "../schemas/response-function-items.ts";

export const FunctionCallSchema = ResponseFunctionCallSchema.required({
    id: true,
    status: true,
});

export const FunctionCallOutputSchema =
    ResponseFunctionCallOutputSchema.required({ id: true, status: true });

export type FunctionCall = z.infer<typeof FunctionCallSchema>;
export type FunctionCallOutput = z.infer<typeof FunctionCallOutputSchema>;

export function parseFunctionName(name: string) {
    const match = /^mcp__(.+?)__(.+)$/.exec(name);
    return match ? { serverLabel: match[1], name: match[2] } : undefined;
}
