#!/usr/bin/env node
// Entry point. Resolves the model (flag/env/config/default) and a stored API
// key, then renders the Ink app. `--logout` clears the cached key.

import { render } from "ink";
import {
    clearApiKey,
    getStoredApiKey,
    getStoredModel,
    storeModel,
} from "./auth.js";
import { App } from "./ui/App.js";

const DEFAULT_MODEL = "mistral";
const KNOWN_MODELS = ["mistral", "openai", "deepseek", "claude-fast"];

function parseArgs(argv: string[]): { logout: boolean; model: string | null } {
    let logout = false;
    let model: string | null = null;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--logout") logout = true;
        else if (arg === "--model") model = argv[++i] ?? null;
        else if (arg.startsWith("--model="))
            model = arg.slice("--model=".length);
    }
    return { logout, model };
}

async function main() {
    const { logout, model: modelArg } = parseArgs(process.argv.slice(2));

    if (logout) {
        await clearApiKey();
        console.log("Disconnected from the Sub-Etha Net. Run again to log in.");
        return;
    }

    if (modelArg) {
        if (!KNOWN_MODELS.includes(modelArg)) {
            console.error(
                `Unknown model "${modelArg}". Choose one of: ${KNOWN_MODELS.join(", ")}`,
            );
            process.exit(1);
        }
        await storeModel(modelArg);
    }

    const model = modelArg ?? (await getStoredModel()) ?? DEFAULT_MODEL;
    const apiKey = await getStoredApiKey();

    const { waitUntilExit } = render(
        <App initialApiKey={apiKey} model={model} />,
    );
    await waitUntilExit();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
