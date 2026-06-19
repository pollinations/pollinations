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

// reasoning_effort -> budget_tokens for budget-mode models. budget_tokens must
// be < max_tokens, so caller-provided max_tokens can force a clamp below.
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

function numericOption(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.floor(value)
        : undefined;
}

function maxTokenLimit(options: TransformOptions): number | undefined {
    return (
        numericOption(options.max_completion_tokens) ??
        numericOption(options.max_tokens)
    );
}

function clampBudgetToMaxTokens(
    budgetTokens: number,
    options: TransformOptions,
): number | undefined {
    const maxTokens = maxTokenLimit(options);
    if (maxTokens === undefined) return budgetTokens;

    const maxBudget = maxTokens - 1;
    if (maxBudget < MIN_THINKING_BUDGET) return undefined;
    return Math.min(budgetTokens, maxBudget);
}

/**
 * Creates a transform that maps the standard `reasoning_effort` (and the
 * deprecated internal `thinking_budget`) onto Claude's native extended-thinking
 * request shape for Bedrock. Thinking is OFF by default; it is only enabled
 * when the caller asks for it. `reasoning_effort:"none"` / `thinking_budget===0`
 * leave thinking off.
 */
export function createClaudeThinkingTransform(
    mode: ClaudeThinkingMode,
): TransformFn {
    return (messages, options) => {
        const updated: TransformOptions = { ...options };
        const budget = updated.thinking_budget;
        const effort = normalizeEffort(updated.reasoning_effort);

        // These are internal/standard inputs, not Claude-native params — never
        // forward them raw to Bedrock.
        delete updated.thinking_budget;
        delete updated.reasoning_effort;

        const explicitlyOff = budget === 0 || effort === "none";
        const wantsThinking =
            !explicitlyOff &&
            ((typeof budget === "number" && budget > 0) ||
                effort !== undefined);

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
            const requestedBudgetTokens =
                typeof budget === "number" && budget > 0
                    ? budget
                    : (effort && EFFORT_TO_BUDGET[effort]) ||
                      EFFORT_TO_BUDGET.medium;
            const budgetTokens = clampBudgetToMaxTokens(
                requestedBudgetTokens,
                updated,
            );
            if (budgetTokens === undefined) {
                log(
                    "Skipping Claude budget thinking because max_tokens is too small",
                );
                return { messages, options: updated };
            }
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
