import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const AGENT_MODEL_HEADER = "x-pollinations-agent-model";

export const AGENT_MODEL_SHORT_HEADER = "agent-model";

const AgentModelSchema = z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional()
    .describe(
        "Override an endpoint agent's inner model. The body model still selects the agent; omit both headers to use its registered default. agent-model and X-Pollinations-Agent-Model are aliases and must agree when both are supplied. Only supported by endpoint agents.",
    );

export const AgentModelHeadersSchema = z
    .object({
        [AGENT_MODEL_HEADER]: AgentModelSchema,
        [AGENT_MODEL_SHORT_HEADER]: AgentModelSchema,
    })
    .refine(
        (headers) =>
            headers[AGENT_MODEL_HEADER] === undefined ||
            headers[AGENT_MODEL_SHORT_HEADER] === undefined ||
            headers[AGENT_MODEL_HEADER] === headers[AGENT_MODEL_SHORT_HEADER],
        { message: "agent-model and X-Pollinations-Agent-Model must agree" },
    );

export function getAgentModel(headers: Headers): string | undefined {
    const result = AgentModelHeadersSchema.safeParse({
        [AGENT_MODEL_HEADER]: headers.get(AGENT_MODEL_HEADER) ?? undefined,
        [AGENT_MODEL_SHORT_HEADER]:
            headers.get(AGENT_MODEL_SHORT_HEADER) ?? undefined,
    });
    if (!result.success) {
        throw new HTTPException(400, {
            message: result.error.issues[0].message,
        });
    }
    return (
        result.data[AGENT_MODEL_SHORT_HEADER] ?? result.data[AGENT_MODEL_HEADER]
    );
}

export function requireEndpointAgent(
    header: string | undefined,
    endpointType?: string,
): void {
    if (header !== undefined && endpointType !== "endpoint_agent") {
        throw new HTTPException(400, {
            message:
                "X-Pollinations-Agent-Model is supported only by endpoint agents",
        });
    }
}
