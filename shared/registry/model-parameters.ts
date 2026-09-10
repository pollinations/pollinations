/**
 * Chat request controls, as they actually behave through Pollinations.
 *
 * The base list mirrors the gateway's Chat Completions surface. Per-model
 * deviations below are verified against the generation pipeline
 * (gen.pollinations.ai/src/text/availableModels.ts transforms), not copied
 * from upstream provider docs:
 *
 * - Stripped controls never reach the upstream (e.g. sampling knobs the
 *   provider rejects, reasoning toggles without a reasoning mode).
 * - Mapped controls are accepted but translated (e.g. reasoning_effort
 *   becomes a thinking budget on Claude).
 * - Everything else is forwarded as sent.
 *
 * Only models with a verified profile advertise parameters; anything else
 * omits the fields rather than guessing.
 */

/** Full Chat Completions control surface accepted by the gateway. */
export const BASE_CHAT_PARAMETERS: string[] = [
    "messages",
    "model",
    "temperature",
    "top_p",
    "frequency_penalty",
    "presence_penalty",
    "repetition_penalty",
    "logit_bias",
    "logprobs",
    "top_logprobs",
    "max_tokens",
    "response_format",
    "seed",
    "stop",
    "stream",
    "stream_options",
    "reasoning_effort",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "user",
];

/**
 * Gateway request defaults: what Pollinations applies when the caller omits
 * the control. Only controls in the model's supported set are listed.
 */
export const CHAT_PARAMETER_DEFAULTS: Record<string, unknown> = {
    frequency_penalty: 0,
    presence_penalty: 0,
    logprobs: false,
    stream: false,
    parallel_tool_calls: true,
};

export interface ModelParameterProfile {
    /** Controls this model actually honors, subset of BASE_CHAT_PARAMETERS. */
    supported: string[];
    /** Gateway defaults restricted to the supported set. */
    defaults: Record<string, unknown>;
}

function profile(strip: string[]): ModelParameterProfile {
    const supported = BASE_CHAT_PARAMETERS.filter(
        (param) => !strip.includes(param),
    );
    const defaults: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(CHAT_PARAMETER_DEFAULTS)) {
        if (supported.includes(key)) defaults[key] = value;
    }
    return { supported, defaults };
}

/**
 * Verified per-model profiles, keyed by canonical registry id. Aliases
 * resolve to the same definition, so listings stay consistent.
 *
 * - openai/gpt-5.4-nano (Azure): sampling knobs are stripped upstream
 *   (omitOpenAISampling); reasoning_effort is honored.
 * - deepseek/deepseek-v4-flash (Fireworks): full surface; reasoning_effort
 *   toggles thinking, "none" disables it (fireworksThinking).
 * - anthropic/claude-sonnet-4.6 (Bedrock): temperature/top_p are stripped
 *   (omitClaudeSampling); reasoning_effort is mapped to an adaptive
 *   thinking budget rather than passed through (claudeAdaptiveThinking).
 */
const VERIFIED_CHAT_PARAMETER_PROFILES: Record<string, ModelParameterProfile> =
    {
        "openai/gpt-5.4-nano": profile([
            "temperature",
            "top_p",
            "frequency_penalty",
            "presence_penalty",
            "repetition_penalty",
            "seed",
        ]),
        "deepseek/deepseek-v4-flash": profile([]),
        "anthropic/claude-sonnet-4.6": profile(["temperature", "top_p"]),
    };

export function getModelChatParameters(
    canonicalId: string,
): ModelParameterProfile | null {
    return VERIFIED_CHAT_PARAMETER_PROFILES[canonicalId] ?? null;
}
