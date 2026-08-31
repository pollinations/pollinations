import { gen } from "../lib/api.js";
import type { HarnessModel } from "./types.js";

interface CatalogModel {
    id: string;
    input_modalities?: unknown;
    output_modalities?: unknown;
    supported_endpoints?: unknown;
    tools?: boolean;
    context_length?: number;
    agent?: unknown;
    reasoning?: boolean;
}

/**
 * First-party text models with tool calling — what an agentic harness can
 * drive. Community models (`owner/name`) and published agents are left out:
 * they come and go, and they would triple the list.
 */
export const fetchHarnessModels = async (
    apiKey?: string | null,
): Promise<HarnessModel[]> => {
    const { data } = await gen<{ data: CatalogModel[] }>(
        "/v1/models",
        // An explicit empty key keeps the public preflight unauthenticated;
        // omitting apiKey would inherit the user's global CLI credential.
        { apiKey: apiKey ?? "" },
    );
    return data
        .filter(
            (m) =>
                typeof m.id === "string" &&
                m.id.trim() !== "" &&
                m.id === m.id.trim() &&
                Array.isArray(m.input_modalities) &&
                m.input_modalities.includes("text") &&
                m.tools === true &&
                Array.isArray(m.output_modalities) &&
                m.output_modalities.includes("text") &&
                Array.isArray(m.supported_endpoints) &&
                m.supported_endpoints.includes("/v1/chat/completions") &&
                typeof m.context_length === "number" &&
                Number.isFinite(m.context_length) &&
                m.context_length > 0 &&
                m.agent === undefined &&
                !m.id.includes("/"),
        )
        .map((m) => {
            const input = (m.input_modalities as string[]).filter(
                (modality) => modality === "text" || modality === "image",
            );
            return {
                id: m.id,
                contextWindow: m.context_length as number,
                input,
                ...(m.reasoning === true ? { reasoning: true } : {}),
            };
        });
};
