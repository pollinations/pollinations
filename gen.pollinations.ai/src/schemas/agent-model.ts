import { AgentModelSchema } from "@shared/schemas/openai.ts";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const AGENT_MODEL_HEADER = "x-pollinations-agent-model";

export const AgentModelHeadersSchema = z.object({
    [AGENT_MODEL_HEADER]: AgentModelSchema,
});

export function getAgentModel(
    headers: Headers,
    bodyModel?: unknown,
): string | undefined {
    const result = AgentModelHeadersSchema.extend({
        agent_model: AgentModelSchema,
    }).safeParse({
        [AGENT_MODEL_HEADER]: headers.get(AGENT_MODEL_HEADER) ?? undefined,
        agent_model: bodyModel,
    });
    if (!result.success) {
        throw new HTTPException(400, {
            message: result.error.issues[0].message,
        });
    }
    const headerModel = result.data[AGENT_MODEL_HEADER];
    const bodyValue = result.data.agent_model;
    if (
        headerModel !== undefined &&
        bodyValue !== undefined &&
        headerModel !== bodyValue
    ) {
        throw new HTTPException(400, {
            message: "agent_model and X-Pollinations-Agent-Model must agree",
        });
    }
    return headerModel ?? bodyValue;
}

export function requireEndpointAgent(
    header: string | undefined,
    endpointType?: string,
): void {
    if (header !== undefined && endpointType !== "endpoint_agent") {
        throw new HTTPException(400, {
            message:
                "agent_model and X-Pollinations-Agent-Model are supported only by endpoint agents",
        });
    }
}
