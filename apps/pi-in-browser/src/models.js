// Model catalog: fetches /v1/models and keeps the first-party tool-calling
// text models an agentic harness can drive. Mirrors
// packages/polli-cli/src/harnesses/models.ts.

import { GEN_BASE_URL } from "./piConfig.js";

export function filterAgentModels(data) {
    return (data ?? [])
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
            contextWindow: m.context_length,
            input: (m.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
        }));
}

export async function fetchAgentModels(fetchImpl = fetch) {
    const response = await fetchImpl(`${GEN_BASE_URL}/v1/models`);
    if (!response.ok) {
        throw new Error(
            `Model catalog request failed: HTTP ${response.status}`,
        );
    }
    const body = await response.json();
    const models = filterAgentModels(body?.data);
    if (models.length === 0) {
        throw new Error("No tool-calling text models in the catalog.");
    }
    return models;
}
