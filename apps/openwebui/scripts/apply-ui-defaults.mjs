import { BANNERS, PINNED_MODELS, PROMPT_SUGGESTIONS } from "../ui-defaults.js";

// Open WebUI stores these settings on first boot and ignores the env vars
// afterwards, so an existing install has to be changed through the admin API:
//   OWUI_URL=https://openwebui.pollinations.ai OWUI_TOKEN=<admin key or JWT> \
//     node scripts/apply-ui-defaults.mjs
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
        body: body && JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${await response.text()}`);
    }
    return response.json();
}

// The models and admin forms replace every field they carry, so read them
// first and change only ours. Skipping that would reset
// DEFAULT_MODEL_METADATA, which turns off the builtin tools managed agents
// reject.
await api("/configs/models", {
    ...(await api("/configs/models")),
    DEFAULT_MODELS: PINNED_MODELS[0],
    DEFAULT_PINNED_MODELS: PINNED_MODELS.join(","),
});
await api("/configs/suggestions", { suggestions: PROMPT_SUGGESTIONS });
await api("/configs/banners", { banners: BANNERS });
await api("/auths/admin/config", {
    ...(await api("/auths/admin/config")),
    ENABLE_COMMUNITY_SHARING: false,
});
await api("/evaluations/config", { ENABLE_EVALUATION_ARENA_MODELS: false });
console.log(`Applied UI defaults to ${base}`);
