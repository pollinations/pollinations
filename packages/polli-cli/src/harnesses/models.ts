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

const MAX_MODEL_ID_LENGTH = 256;
const INVALID_MODEL_ID_CHARS = /[\s\p{Cc}]/u;

const isSafeModelId = (id: unknown): id is string =>
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_MODEL_ID_LENGTH &&
    id.trim() === id &&
    !INVALID_MODEL_ID_CHARS.test(id);

const hasSupportedInputModalities = (
    modalities: unknown,
): modalities is ("text" | "image")[] =>
    Array.isArray(modalities) &&
    modalities.includes("text") &&
    modalities.every((modality) => modality === "text" || modality === "image");

/** Text models with tool calling that an agentic harness can drive. */
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
                isSafeModelId(m.id) &&
                hasSupportedInputModalities(m.input_modalities) &&
                m.tools === true &&
                Array.isArray(m.output_modalities) &&
                m.output_modalities.includes("text") &&
                Array.isArray(m.supported_endpoints) &&
                m.supported_endpoints.includes("/v1/chat/completions") &&
                typeof m.context_length === "number" &&
                Number.isFinite(m.context_length) &&
                m.context_length > 0 &&
                m.agent === undefined,
        )
        .map((m) => {
            return {
                id: m.id,
                contextWindow: m.context_length as number,
                input: m.input_modalities,
                ...(m.reasoning === true ? { reasoning: true } : {}),
            };
        });
};
