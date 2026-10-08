// Plain data and pure helpers shared by the page, the tests and the e2e run.

export const GEN = "https://gen.pollinations.ai";
export const ENTER = "https://enter.pollinations.ai";
export const COMPLETIONS = `${GEN}/v1/chat/completions`;
export const PI_PACKAGE = "wasmer/pi@=1.0.0";
export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

// The SDK can only reach files under /workspace. Pi's home (config, sessions,
// the provider extension and the request mailbox) lives in /workspace/.pi;
// the visitor's project is /workspace/project.
export const HOME = "/workspace";
export const PI_DIR = `${HOME}/.pi`;
export const MAILBOX = `${PI_DIR}/bridge`;
export const EXTENSION = `${PI_DIR}/pollinations.mjs`;
export const PROVIDER_FILE = `${PI_DIR}/pollinations.json`;
export const PROJECT = `${HOME}/project`;

// Catalog prices are Pollen per token; Pi wants a price per million tokens.
const perMillion = (price) => Number(price ?? 0) * 1e6;

// Same selection as packages/polli-cli/src/harnesses/models.ts: first-party
// text models that can call tools through /v1/chat/completions.
export function toolModels(catalog) {
    return catalog
        .filter(
            (m) =>
                m.tools === true &&
                m.output_modalities?.includes("text") &&
                m.supported_endpoints?.includes("/v1/chat/completions") &&
                m.context_length &&
                !m.agent &&
                m.community !== true,
        )
        .map((m) => ({
            id: m.id,
            name: m.title || m.id,
            contextWindow: m.context_length,
            input: (m.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
            reasoning: m.reasoning === true,
            // Lets Pi report each run's cost in Pollen.
            cost: {
                input: perMillion(m.pricing?.promptTextTokens),
                output: perMillion(m.pricing?.completionTextTokens),
                cacheRead: perMillion(m.pricing?.promptCachedTokens),
                cacheWrite: perMillion(m.pricing?.promptCacheWriteTokens),
            },
        }));
}

// Provider settings from packages/polli-cli/src/harnesses/pi.ts. The key is a
// placeholder: the page adds the real one outside the sandbox.
export function providerConfig(models) {
    return {
        baseUrl: `${GEN}/v1`,
        apiKey: "set-by-the-page",
        compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: true,
            supportsUsageInStreaming: true,
            supportsStrictMode: false,
            maxTokensField: "max_tokens",
        },
        models,
    };
}

export function piArgs({ model, prompt, sessionId }) {
    return [
        "--offline",
        "--no-extensions",
        "--extension",
        EXTENSION,
        "--provider",
        "pollinations",
        "--model",
        model,
        "--session-id",
        sessionId,
        "--mode",
        "json",
        "--print",
        "--",
        prompt,
    ];
}

// The only request the page performs for the sandbox. Guest headers are
// dropped, so the guest cannot pick the credential or the destination.
export function bridgeRequest(request, apiKey) {
    if (request.method !== "POST" || request.url !== COMPLETIONS)
        throw new Error(
            `Blocked ${request.method} ${request.url}: Pi may only call ${COMPLETIONS}`,
        );
    return {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: request.body,
    };
}
