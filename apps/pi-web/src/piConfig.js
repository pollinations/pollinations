// Pure builders for the guest Pi configuration.
// Schema mirrors packages/polli-cli/src/harnesses/pi.ts.

export const PI_VERSION = "0.87.1";
export const PI_PACKAGE_SPEC = `wasmer/pi@=${PI_VERSION}`;

export const GUEST = {
    home: "/workspace",
    agentDir: "/workspace/.pi/agent",
    bridgeDir: "/workspace/.bridge",
    extensionPath: "/workspace/.bridge/bridge.mjs",
    pumpPath: "/workspace/.bridge/pump.mjs",
    sessionPath: "/workspace/.bridge/session.json",
};

export const PROVIDER_COMPAT = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

// The guest never sees a real key: models.json carries the literal "bridge"
// placeholder and the extension's fetch shim ignores it. The host adds the
// real Authorization header itself on the trusted side of the bridge.
export function buildModelsJson(modelIds = [DEFAULT_MODEL]) {
    return {
        providers: {
            pollinations: {
                baseUrl: "https://gen.pollinations.ai/v1",
                api: "openai-completions",
                apiKey: "bridge",
                compat: { ...PROVIDER_COMPAT },
                models: modelIds.map((id) => ({
                    id,
                    name: id,
                    contextWindow: 128000,
                    maxTokens: 16384,
                    input: ["text"],
                    reasoning: false,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                })),
            },
        },
    };
}

export function buildAuthJson() {
    return { pollinations: { type: "api_key", key: "bridge" } };
}

export function buildSettingsJson(defaultModel = DEFAULT_MODEL) {
    return { defaultProvider: "pollinations", defaultModel };
}

export function buildSessionJson({ runId, keyGen }) {
    return { runId, keyGen };
}

export function piRunArgs({ model, prompt, continueSession = false }) {
    const args = [
        "--extension",
        GUEST.extensionPath,
        "--provider",
        "pollinations",
        "--model",
        model,
        "--mode",
        "json",
    ];
    if (continueSession) args.push("--continue");
    args.push("-p", prompt);
    return args;
}
