import { pathToFileURL } from "node:url";
import {
    BANNERS,
    DEFAULT_MODEL,
    PINNED_MODELS,
    PROMPT_SUGGESTIONS,
} from "../ui-defaults.js";

// Open WebUI reads env vars into DEFAULT_CONFIG only when a key is missing
// from the Postgres config table, so editing worker.js does nothing to an
// install that has already booted. These three admin-API calls write the same
// values from ui-defaults.js instead:
//
//   OWUI_URL=https://openwebui.pollinations.ai OWUI_TOKEN=<admin key or JWT> \
//     node scripts/apply-ui-defaults.mjs
//
// /configs/models replaces every field it carries, so the stored value is read
// first and only our two keys are overwritten. Posting the form without
// DEFAULT_MODEL_METADATA would reset it to null, which turns the builtin tools
// back on and makes managed agents reject every UI chat.
export const payloads = {
    models: (stored) => ({
        ...stored,
        DEFAULT_MODELS: DEFAULT_MODEL,
        DEFAULT_PINNED_MODELS: PINNED_MODELS.join(","),
    }),
    suggestions: { suggestions: PROMPT_SUGGESTIONS, i18n: null },
    banners: BANNERS,
};

async function main() {
    const base = process.env.OWUI_URL?.replace(/\/$/, "");
    const token = process.env.OWUI_TOKEN;
    if (!base || !token) {
        console.error("Set OWUI_URL and OWUI_TOKEN (an admin API key or JWT).");
        process.exit(1);
    }

    async function api(path, body) {
        const response = await fetch(`${base}/api/v1${path}`, {
            method: body ? "POST" : "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(
                `${path}: ${response.status} ${await response.text()}`,
            );
        }
        return response.json();
    }

    await api("/configs/models", payloads.models(await api("/configs/models")));
    await api("/configs/suggestions", payloads.suggestions);
    await api("/configs/banners", payloads.banners);
    console.log(`Applied ui defaults to ${base}`);
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
