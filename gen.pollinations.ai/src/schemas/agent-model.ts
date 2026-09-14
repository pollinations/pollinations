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
    const headerModel = headers.get(AGENT_MODEL_HEADER)?.trim();
    const bodyValue =
        typeof bodyModel === "string" ? bodyModel.trim() : undefined;
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
