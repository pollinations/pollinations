// Chat-route parameter support for official text models.
//
// Everything here is route-level truth for `/v1/chat/completions` on the
// Pollinations gateway: entries record which request controls survive the
// model's transform chain and are forwarded upstream, verified against
// `gen.pollinations.ai/src/text/availableModels.ts` (transforms that silently
// drop controls) and `gen.pollinations.ai/src/text/configs/modelConfigs.ts`.
// Controls not listed are not guaranteed: the request schema may accept them
// while the route silently ignores them.
//
// This is discovery metadata for the Chat route only. It does not describe
// the native `/v1/responses` API. Models without an entry (including all
// community models) omit `supported_parameters` / `default_parameters` —
// unknown support is never invented.

export type ChatParameterSupport = {
    /** Controls accepted and forwarded for this model's Chat route. */
    supportedParameters: string[];
    /** Values Pollinations applies when a Chat caller omits the control. */
    defaultParameters: Record<string, string | number | boolean>;
};

const support: Record<string, ChatParameterSupport> = {
    // Azure OpenAI route: the omitOpenAISampling transform drops sampling
    // controls (temperature, top_p, penalties, seed) before dispatch, so they
    // are accepted by the request schema but silently ignored.
    "openai/gpt-5.4": {
        supportedParameters: [
            "stream",
            "max_tokens",
            "max_completion_tokens",
            "reasoning_effort",
            "response_format",
            "stop",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
        ],
        defaultParameters: {
            stream: false,
            parallel_tool_calls: true,
        },
    },
    // OVHcloud OpenAI-compatible route: no transform strips controls, so the
    // standard Chat sampling controls pass through to the model.
    "openai/gpt-oss-20b": {
        supportedParameters: [
            "stream",
            "max_tokens",
            "temperature",
            "top_p",
            "frequency_penalty",
            "presence_penalty",
            "repetition_penalty",
            "seed",
            "reasoning_effort",
            "response_format",
            "stop",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
        ],
        // OpenAI documents the gpt-oss family sampling defaults as
        // temperature=1.0 / top_p=1.0; reasoning effort is configurable but
        // Pollinations injects no value when the caller omits it.
        defaultParameters: {
            temperature: 1,
            top_p: 1,
            stream: false,
            parallel_tool_calls: true,
        },
    },
    // Bedrock Converse route: temperature and top_p are mutually exclusive
    // (preferTemperature drops top_p when temperature is set); reasoning_effort
    // maps onto adaptive thinking. Penalties, seed, and parallel_tool_calls are
    // not advertised because the native route has no equivalent controls.
    "anthropic/claude-sonnet-4.6": {
        supportedParameters: [
            "stream",
            "max_tokens",
            "max_completion_tokens",
            "temperature",
            "top_p",
            "reasoning_effort",
            "tools",
            "tool_choice",
        ],
        defaultParameters: {
            stream: false,
        },
    },
};

/** Chat-route parameter metadata for one model, or undefined when unknown. */
export function getChatParameterSupport(
    modelName: string,
): ChatParameterSupport | undefined {
    return support[modelName];
}
