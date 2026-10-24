import { z } from "zod";

// Model metadata schemas shared by the Pollinations and OpenAI-compatible
// model schemas, kept free of catalog access so the code-agent bundle never
// loads the per-model files.

export const ModelHealthSchema = z
    .object({
        status: z.enum(["healthy", "degraded", "down", "unknown"]).meta({
            description:
                "Healthy above 95% success, degraded above 80% through 95%, down at 80% or below, unknown with no measured requests.",
        }),
        success_rate: z.number().min(0).max(100).nullable().meta({
            description:
                "Success across the last 50 eligible final requests within seven days for community proxies, or the last 24 hours for other models; null with no measured requests.",
        }),
        requests: z.number().int().nonnegative().meta({
            description:
                "Number of eligible final responses in the health sample (at most 50 for community proxies).",
        }),
    })
    .meta({
        description:
            "Recent gateway reliability: last 50 eligible final requests within seven days for community proxies, last 24 hours for other models. Refreshed roughly every 60s. Final 4xx are excluded; owner requests, monitor probes, and successful fallback rescues count. Not individual upstream health.",
    });

// Pricing uses registry field names directly, filtering out zero/undefined values
// Fields: promptTextTokens, promptCachedTokens, promptCacheWriteTokens,
//         promptAudioTokens, promptAudioSeconds, promptImageTokens,
//         completionTextTokens, completionReasoningTokens, completionAudioTokens,
//         completionImageTokens, completionVideoSeconds, completionVideoTokens
// An agent has no price of its own: callers pay for the model and tool calls
// it makes. Shared by the Pollinations and OpenAI-compatible model schemas.
export const AGENT_FIELD_DESCRIPTIONS = {
    agent: "True for agents. An agent's charges are the model and tool calls it makes, billed to the caller under those models.",
    base_model:
        "Model a prompt agent runs on; `pricing` shows its rates. Absent when Gen cannot see which models an agent calls.",
    pricing:
        "Pollen rates per billed unit. Paid tool calls an agent makes are billed on top. An agent without `base_model` lists only `currency`: its charges depend on the calls it makes.",
};
