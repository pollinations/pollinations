// Builders for the guest-side Pi configuration.
// The JSON shapes mirror packages/polli-cli/src/harnesses/pi.ts so that the
// browser example configures Pi exactly the way the CLI harness does.

export const GEN_BASE_URL = "https://gen.pollinations.ai";
export const PI_VERSION = "0.87.1";
export const PI_PACKAGE = `wasmer/pi@=${PI_VERSION}`;

export const GUEST = {
    home: "/workspace",
    agentDir: "/workspace/.pi/agent",
    bridgeDir: "/workspace/.bridge",
    extensionPath: "/workspace/.bridge/bridge.mjs",
    modelsPath: "/workspace/.pi/agent/models.json",
    authPath: "/workspace/.pi/agent/auth.json",
    settingsPath: "/workspace/.pi/agent/settings.json",
};

// Set to match what gen.pollinations.ai actually accepts for these routes.
export const PROVIDER_COMPAT = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

export const DEFAULT_MODEL = "openai/gpt-5.4-nano";

export const FALLBACK_MODELS = [
    { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano", contextWindow: 128000, input: ["text"] },
];

export function buildModelsJson(models = FALLBACK_MODELS) {
    return {
        providers: {
            pollinations: {
                baseUrl: `${GEN_BASE_URL}/v1`,
                api: "openai-completions",
                compat: { ...PROVIDER_COMPAT },
                models: models.map((model) => ({
                    id: model.id,
                    name: model.name ?? model.id,
                    contextWindow: model.contextWindow ?? 128000,
                    input: model.input ?? ["text"],
                })),
            },
        },
    };
}

// The sandbox never holds a real credential.
export const BRIDGE_PLACEHOLDER_KEY = "bridge";

export function buildAuthJson() {
    return { pollinations: { type: "api_key", key: BRIDGE_PLACEHOLDER_KEY } };
}

export function buildSettingsJson(model = DEFAULT_MODEL) {
    return { defaultProvider: "pollinations", defaultModel: model };
}

export function buildPiArgs({ prompt, model = DEFAULT_MODEL, sessionId = null }) {
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
    if (sessionId) args.push("--session", sessionId);
    args.push("-p", prompt);
    return args;
}

// Pi's --mode json prints one JSON object per line; keep the parse tolerant of
// any other diagnostics the CLI writes to stdout.
export function parsePiEvents(text) {
    const events = [];
    for (const line of String(text).split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
            events.push(JSON.parse(trimmed));
        } catch {}
    }
    return events;
}
