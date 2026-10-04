// Model catalog loading and filtering.
// Filter: first-party (not community), text out, tool calling, served on
// /v1/chat/completions. Field names verified against a captured /v1/models
// response (test/fixtures/v1-models.json).

export function isToolChatModel(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (entry.community === true) return false;
    if (entry.tools !== true) return false;
    if (!Array.isArray(entry.supported_endpoints)) return false;
    if (!entry.supported_endpoints.includes("/v1/chat/completions"))
        return false;
    const out = entry.output_modalities;
    if (Array.isArray(out) && out.length > 0 && !out.includes("text"))
        return false;
    return typeof entry.id === "string" && entry.id.length > 0;
}

export function filterToolModels(listResponse) {
    const data = listResponse?.data;
    if (!Array.isArray(data)) return [];
    return data.filter(isToolChatModel).map((m) => ({
        id: m.id,
        title: typeof m.title === "string" ? m.title : m.id,
    }));
}

export async function fetchToolModels(fetchImpl, apiKey, signal) {
    const resp = await fetchImpl("https://gen.pollinations.ai/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
    });
    if (!resp.ok) {
        const err = new Error(`models request failed: HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return filterToolModels(await resp.json());
}
