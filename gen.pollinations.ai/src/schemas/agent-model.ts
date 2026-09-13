import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const AGENT_MODEL_HEADER = "x-pollinations-agent-model";

export const AgentModelHeadersSchema = z.object({
    [AGENT_MODEL_HEADER]: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .optional()
        .describe(
            "Override an endpoint agent's inner model. The body model still selects the agent; omit this header to use its registered default. Only supported by endpoint agents.",
        ),
});

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
