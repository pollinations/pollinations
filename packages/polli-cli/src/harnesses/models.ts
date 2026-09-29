import { gen } from "../lib/api.js";
import type { HarnessModel } from "./types.js";

interface CatalogModel {
    id: string;
    community?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    supported_endpoints?: string[];
    tools?: boolean;
    context_length?: number;
    agent?: unknown;
}

/**
 * First-party text models with tool calling — what an agentic harness can
 * drive. Community models and published agents are left out:
 * they come and go, and they would triple the list.
 */
export const fetchHarnessModels = async (
    selectedModel: string,
): Promise<HarnessModel[]> => {
    const { data } = await gen<{ data: CatalogModel[] }>("/v1/models");
    const models = data
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
            contextWindow: m.context_length as number,
            input: (m.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
        }));
    if (!models.some((model) => model.id === selectedModel)) {
        throw new Error(
            `Model "${selectedModel}" is not a tool-calling text model. Run: polli models`,
        );
    }
    return models;
};
