import debug from "debug";
import type { TransformFn, TransformOptions } from "../types.js";

const log = debug("pollinations:transforms:reasoning-effort");

/**
 * Per-model reasoning capability. Determines how the standard OpenAI
 * `reasoning_effort` is normalized before the request reaches the upstream
 * provider.
 *
 * - `"toggle"`: model supports disabling thinking via `reasoning_effort:"none"`
 *   (Fireworks GLM/Kimi/DeepSeek/Qwen/MiniMax-M3). `"minimal"` is rejected by
 *   Fireworks, so it is normalized to `"none"`.
 * - `"mandatory"`: model requires reasoning to stay on and rejects `"none"`
 *   with a 400 (Fireworks MiniMax-M2 and similar). Off-requests are dropped so
 *   the model keeps its always-on default; `minimal` maps to `low`.
 * - `"strip"`: model has no reasoning mode and errors when the param is
 *   forwarded (mistral-large 500; OpenRouter non-reasoning models 400; the
 *   non-reasoning Grok deployment 500). The param is removed entirely.
 */
export type ReasoningCapability = "toggle" | "mandatory" | "strip";

/**
 * Creates a transform that normalizes `reasoning_effort` for a given model
 * capability. `reasoning_effort` is the standard, OpenAI-compatible control.
 */
export function createReasoningEffortTransform(
    capability: ReasoningCapability,
): TransformFn {
    return (messages, options) => {
        const updated: TransformOptions = { ...options };
        const effort =
            typeof updated.reasoning_effort === "string"
                ? updated.reasoning_effort.toLowerCase()
                : undefined;

        if (capability === "strip") {
            delete updated.reasoning_effort;
            return { messages, options: updated };
        }

        const wantsOff = effort === "none";

        if (capability === "mandatory") {
            // Reasoning can't be disabled; drop off-requests, keep on-levels.
            if (wantsOff) {
                log(
                    "Dropping unsupported off value for mandatory-reasoning model",
                );
                delete updated.reasoning_effort;
            } else if (effort === "minimal") {
                updated.reasoning_effort = "low";
            } else if (effort === "xhigh") {
                updated.reasoning_effort = "high";
            }
            return { messages, options: updated };
        }

        // capability === "toggle"
        if (wantsOff) {
            updated.reasoning_effort = "none";
        } else if (effort === "minimal") {
            updated.reasoning_effort = "none";
        }
        return { messages, options: updated };
    };
}
