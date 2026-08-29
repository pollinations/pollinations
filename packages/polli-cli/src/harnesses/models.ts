import { gen } from "../lib/api.js";
import type { HarnessModel } from "./types.js";

interface CatalogModel {
    id: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    context_length?: number;
    agent?: unknown;
}

/**
 * First-party text models with tool calling — what an agentic harness can
 * drive. Community models (`owner/name`) and published agents are left out:
 * they come and go, and they would triple the list.
 */
export const fetchHarnessModels = async (): Promise<HarnessModel[]> => {
    const { data } = await gen<{ data: CatalogModel[] }>("/v1/models");
    return data
        .filter(
            (m) =>
                m.tools === true &&
                m.output_modalities?.includes("text") &&
                m.context_length &&
                !m.agent &&
                !m.id.includes("/"),
        )
        .map((m) => ({
            id: m.id,
            contextWindow: m.context_length as number,
            input: (m.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
        }));
};
