import debug from "debug";
import type { TransformFn, TransformOptions } from "../types.js";

const log = debug("pollinations:transforms:claude-thinking");

/**
 * Claude extended-thinking mechanism, which differs by model family (verified
 * live against Bedrock through the Portkey gateway):
 *
 * - `"budget"`: Haiku 4.5 — classic `thinking:{type:"enabled",
 *   budget_tokens:N}`. (`adaptive` is rejected: "adaptive thinking is not
 *   supported on this model".)
 * - `"adaptive"`: Sonnet 4.6 and Opus 4.6/4.7/4.8 —
 *   `thinking:{type:"adaptive"}` + `output_config:{effort}`. On Opus 4.7/4.8,
 *   `{type:"enabled",budget_tokens}` is rejected; on Sonnet/Opus 4.6 it still
 *   works but is deprecated.
 */
export type ClaudeThinkingMode = "budget" | "adaptive";

const MIN_THINKING_BUDGET = 1024;

// reasoning_effort -> budget_tokens for budget-mode models.
const EFFORT_TO_BUDGET: Record<string, number> = {
    minimal: MIN_THINKING_BUDGET,
    low: MIN_THINKING_BUDGET,
    medium: 2048,
    high: 4096,
    xhigh: 8192,
};

// reasoning_effort -> output_config.effort for adaptive-mode models.
// `xhigh` is not supported by every adaptive Claude model, so normalize to the
// highest common level instead of risking a provider 400.
const EFFORT_TO_OUTPUT_EFFORT: Record<string, string> = {
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "high",
};

function normalizeEffort(value: unknown): string | undefined {
    return typeof value === "string" ? value.toLowerCase() : undefined;
}

/**
 * Creates a transform that maps the standard `reasoning_effort` onto Claude's
 * native extended-thinking request shape for Bedrock. Thinking is OFF by
 * default; it is only enabled when the caller asks for it.
 * `reasoning_effort:"none"` leaves thinking off.
 */
export function createClaudeThinkingTransform(
    mode: ClaudeThinkingMode,
): TransformFn {
    return (messages, options) => {
        const updated: TransformOptions = { ...options };
        const effort = normalizeEffort(updated.reasoning_effort);

        // This is a standard input, not a Claude-native param — never forward
        // it raw to Bedrock.
        delete updated.reasoning_effort;

        const wantsThinking = effort !== undefined && effort !== "none";

        if (!wantsThinking) {
            // Off (default): emit no thinking block.
            return { messages, options: updated };
        }

        if (mode === "adaptive") {
            updated.thinking = { type: "adaptive" };
            updated.output_config = {
                effort: (effort && EFFORT_TO_OUTPUT_EFFORT[effort]) || "medium",
            };
            log("Enabled adaptive thinking, effort=%s", updated.output_config);
        } else {
            // Anthropic requires budget_tokens < max_tokens (min 1024). We pass
            // the requested budget through as-is — if it exceeds the caller's
            // max_tokens, Bedrock returns its own clear 400 ("max_tokens must be
            // greater than thinking budget"). Thin proxy: surface the upstream
            // error rather than silently changing the caller's requested effort.
            const budgetTokens =
                (effort && EFFORT_TO_BUDGET[effort]) ||
                EFFORT_TO_BUDGET.medium;
            updated.thinking = {
                type: "enabled",
                budget_tokens: budgetTokens,
            };
            log("Enabled budget thinking, budget_tokens=%d", budgetTokens);
        }

        // Anthropic rejects non-default sampling params when thinking is on
        // ("`temperature` may only be set to 1 when thinking is enabled"). Strip
        // them so an enabled toggle never 400s. (Opus 4.7/4.8 already get this in
        // parameterProcessor, but Sonnet/Haiku do not.)
        for (const param of ["temperature", "top_p", "top_k"] as const) {
            if (updated[param] !== undefined) {
                log("Stripping %s for Claude thinking", param);
                delete updated[param];
            }
        }

        return { messages, options: updated };
    };
}
