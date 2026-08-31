import { gen } from "../lib/api.js";
import type { HarnessModel } from "./types.js";

interface CatalogModel {
    id?: unknown;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    context_length?: number;
    agent?: unknown;
    supported_endpoints?: string[];
}

export const isValidHarnessModelId = (id: unknown): id is string =>
    typeof id === "string" &&
    id.length > 0 &&
    id.trim() === id &&
    !/[\s\p{Cc}]/u.test(id);

/**
 * Text models with tool calling — what an agentic harness can drive. The
 * catalog metadata, rather than a hardcoded allowlist, is authoritative.
 */
export const fetchHarnessModels = async (
    apiKey?: string,
): Promise<HarnessModel[]> => {
    const { data } = await gen<{ data: CatalogModel[] }>("/v1/models", {
        ...(apiKey ? { apiKey } : {}),
    });
    return data
        .filter(
            (m) =>
                isValidHarnessModelId(m.id) &&
                m.tools === true &&
                Array.isArray(m.input_modalities) &&
                m.input_modalities.includes("text") &&
                m.input_modalities.every(
                    (modality) => modality === "text" || modality === "image",
                ) &&
                Array.isArray(m.output_modalities) &&
                m.output_modalities.includes("text") &&
                Array.isArray(m.supported_endpoints) &&
                m.supported_endpoints.includes("/v1/chat/completions") &&
                typeof m.context_length === "number" &&
                Number.isFinite(m.context_length) &&
                m.context_length > 0 &&
                (m.agent === undefined || m.agent === null),
        )
        .map((m) => ({
            id: m.id as string,
            contextWindow: m.context_length as number,
            input: m.input_modalities as string[],
        }));
};
