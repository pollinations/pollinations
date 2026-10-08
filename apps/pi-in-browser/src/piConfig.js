// Pure builders for the guest Pi configuration.
// Schema mirrors packages/polli-cli/src/harnesses/pi.ts (the canonical way
// Pollinations configures the Pi coding agent).

export const PI_VERSION = "1.0.0";
export const PI_PACKAGE_SPEC = `wasmer/pi@=${PI_VERSION}`;

// Where the webc comes from, in order: a local copy next to the page
// (development), then the pinned Wasmer registry distribution.
export const PI_WEBC_URLS = [
    "./pi.webc",
    "https://cdn.wasmer.io/webcimages/211ad207af3346d75164c357a0fff1aa4ec690da8fc7a39106fe90d7c46689a8.webc",
];

export const GEN_BASE_URL = "https://gen.pollinations.ai";
export const ENTER_URL = "https://enter.pollinations.ai";

export const GUEST = {
    home: "/workspace",
    agentDir: "/workspace/.pi/agent",
    bridgeDir: "/workspace/.bridge",
    extensionPath: "/workspace/.bridge/bridge.mjs",
    pumpPath: "/workspace/.bridge/pump.mjs",
    sessionPath: "/workspace/.bridge/session.json",
};

export const PROVIDER = "pollinations";
export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

export const PROVIDER_COMPAT = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

// The guest never sees the real key: models.json carries the literal
// "bridge" placeholder and the extension's fetch shim ignores credentials
// entirely. The host adds the real Authorization header on the trusted
// side of the bridge, after the allowlist check.
export const BRIDGE_DUMMY_KEY = "bridge";

export function buildModelsJson(models) {
    return {
        providers: {
            [PROVIDER]: {
                baseUrl: `${GEN_BASE_URL}/v1`,
                api: "openai-completions",
                apiKey: BRIDGE_DUMMY_KEY,
                compat: { ...PROVIDER_COMPAT },
                models: models.map((model) => ({
                    id: model.id,
                    name: model.id,
                    contextWindow: model.contextWindow,
                    input: model.input,
                })),
            },
        },
    };
}

export function buildAuthJson() {
    return { [PROVIDER]: { type: "api_key", key: BRIDGE_DUMMY_KEY } };
}

export function buildSettingsJson(defaultModel = DEFAULT_MODEL) {
    return { defaultProvider: PROVIDER, defaultModel };
}

export function buildSessionJson({ runId, keyGen }) {
    return { runId, keyGen };
}

export function piRunArgs({ model, prompt, continueSession = false, mode }) {
    const args = [
        "--extension",
        GUEST.extensionPath,
        "--provider",
        PROVIDER,
        "--model",
        model,
    ];
    if (mode) args.push("--mode", mode);
    if (continueSession) args.push("--continue");
    if (prompt !== undefined) args.push("-p", prompt);
    return args;
}
