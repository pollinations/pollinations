// Pi reads its provider config from ~/.pi/agent/{models,auth,settings}.json.
// wasmer/pi pins HOME=/home/pi (see its wasmer.toml), and this schema mirrors
// the one packages/polli-cli/src/harnesses/pi.ts writes for the desktop CLI.

export const GEN_BASE_URL = "https://gen.pollinations.ai";
// wasmer/pi's own manifest pins HOME=/home/pi, but sandbox `files` may only
// write under /workspace, so HOME is relocated there for the browser client.
export const PI_HOME = "/workspace/home/pi";
const PROVIDER = "pollinations";

export interface CatalogModel {
    id: string;
    community?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    supported_endpoints?: string[];
    tools?: boolean;
    context_length?: number;
    agent?: unknown;
}

export interface AgentModel {
    id: string;
    contextWindow: number;
    input: string[];
}

/** First-party text models with tool calling — what Pi can actually drive. */
export function filterAgentModels(
    models: readonly CatalogModel[],
): AgentModel[] {
    return models
        .filter(
            (m) =>
                m.tools === true &&
                m.output_modalities?.includes("text") &&
                m.supported_endpoints?.includes("/v1/chat/completions") &&
                !!m.context_length &&
                !m.agent &&
                m.community !== true,
        )
        .map((m) => ({
            id: m.id,
            contextWindow: m.context_length as number,
            input: (m.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
        }));
}

export async function fetchAgentModels(): Promise<AgentModel[]> {
    const response = await fetch(`${GEN_BASE_URL}/v1/models`);
    if (!response.ok) {
        throw new Error(`Failed to load models (${response.status})`);
    }
    const { data } = (await response.json()) as { data: CatalogModel[] };
    return filterAgentModels(data);
}

/** Guest files for a sandbox that authenticate Pi against Pollinations. */
export function buildPiConfigFiles(
    apiKey: string,
    model: string,
    models: readonly AgentModel[],
): Record<string, string> {
    const modelsJson = {
        providers: {
            [PROVIDER]: {
                baseUrl: `${GEN_BASE_URL}/v1`,
                api: "openai-completions",
                compat: {
                    supportsStore: false,
                    supportsDeveloperRole: false,
                    supportsReasoningEffort: true,
                    supportsUsageInStreaming: true,
                    supportsStrictMode: false,
                    maxTokensField: "max_tokens",
                },
                models: models.map((m) => ({
                    id: m.id,
                    name: m.id,
                    contextWindow: m.contextWindow,
                    input: m.input,
                })),
            },
        },
    };
    const authJson = { [PROVIDER]: { type: "api_key", key: apiKey } };
    const settingsJson = { defaultProvider: PROVIDER, defaultModel: model };

    return {
        [`${PI_HOME}/.pi/agent/models.json`]: `${JSON.stringify(modelsJson, null, 2)}\n`,
        [`${PI_HOME}/.pi/agent/auth.json`]: `${JSON.stringify(authJson, null, 2)}\n`,
        [`${PI_HOME}/.pi/agent/settings.json`]: `${JSON.stringify(settingsJson, null, 2)}\n`,
    };
}
