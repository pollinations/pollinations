import type { PromptAgentListingPayload } from "@shared/community-endpoints.ts";
import { HTTPException } from "hono/http-exception";
import type { GenerationModelRegistry } from "../../model-registry.ts";

/** Select a caller-requested base model without changing the saved agent. */
export function selectPromptAgentModel(
    config: Pick<PromptAgentListingPayload, "baseModel" | "allowedBaseModels">,
    requested: string,
    registry: GenerationModelRegistry,
): string {
    const selected = registry.resolve(requested.trim());
    const allowed = [config.baseModel, ...(config.allowedBaseModels ?? [])];
    if (
        !selected ||
        selected.info.agent ||
        selected.definition.fallbackOnly ||
        selected.eventType !== "generate.text" ||
        !selected.supportedEndpoints.includes("/v1/chat/completions") ||
        !allowed.some((model) => registry.resolve(model)?.id === selected.id)
    ) {
        throw new HTTPException(400, {
            message:
                "Requested base model is not allowed for this prompt agent",
        });
    }
    return selected.id;
}
