/**
 * The model picker reads the live gateway catalog and keeps only what Pi can
 * actually drive: first-party text models with tool calling. Same filter as
 * `polli-cli`'s harness list, so the app and the CLI offer the same models.
 */

export const GEN_ORIGIN = "https://gen.pollinations.ai";

export function pickPiModels(catalog) {
    return catalog
        .filter(
            (model) =>
                model.tools === true &&
                (model.output_modalities ?? []).includes("text") &&
                (model.supported_endpoints ?? []).includes(
                    "/v1/chat/completions",
                ) &&
                model.context_length &&
                !model.agent &&
                model.community !== true,
        )
        .map((model) => ({
            id: model.id,
            title: model.title || model.id,
            contextWindow: model.context_length,
            input: (model.input_modalities ?? ["text"]).filter(
                (modality) => modality === "text" || modality === "image",
            ),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchPiModels({
    origin = GEN_ORIGIN,
    fetchImpl = fetch,
} = {}) {
    const response = await fetchImpl(`${origin}/v1/models`, {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`model catalog ${response.status}`);
    }
    const { data = [] } = await response.json();
    return pickPiModels(data);
}
