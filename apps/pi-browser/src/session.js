/**
 * The sandbox: Wasmer's published Pi package running in a browser worker,
 * with the fetch bridge injected and Pi configured for Pollinations exactly
 * the way `packages/polli-cli/src/harnesses/pi.ts` configures it on a
 * desktop — same models.json / auth.json / settings.json schema.
 */
import { Wasmer } from "@wasmer/sdk/browser";
import { KEY_PLACEHOLDER } from "./bridge.js";
import { GEN_ORIGIN } from "./catalog.js";
import guestShim from "./guest-shim.js?raw";

export const PI_PACKAGE = "wasmer/pi@=1.0.0";
export const PROVIDER = "pollinations";
// Bundled files must live inside /workspace; Node's --import takes the
// absolute guest path, so the shim is loaded from there.
export const SHIM_PATH = "/workspace/bridge.mjs";

/** Startup flags. The model comes from settings.json; `--model` overrides it. */
export function piArgs({ model, extra = [] } = {}) {
    const args = [];
    if (model) args.push("--model", model);
    return [...args, ...extra];
}

const COMPAT = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    supportsUsageInStreaming: true,
    supportsStrictMode: false,
    maxTokensField: "max_tokens",
};

/** Pi's three config files, plus the injected fetch bridge. */
export function piConfigFiles({ models, model }) {
    return {
        [`${SHIM_PATH}`]: guestShim,
        "/workspace/.pi/agent/models.json": `${JSON.stringify(
            {
                providers: {
                    [PROVIDER]: {
                        baseUrl: `${GEN_ORIGIN}/v1`,
                        api: "openai-completions",
                        compat: COMPAT,
                        models,
                    },
                },
            },
            null,
            2,
        )}\n`,
        // Only a placeholder: the page swaps in the visitor's real key, so the
        // guest never holds a credential.
        "/workspace/.pi/agent/auth.json": `${JSON.stringify(
            { [PROVIDER]: { type: "api_key", key: KEY_PLACEHOLDER } },
            null,
            2,
        )}\n`,
        "/workspace/.pi/agent/settings.json": `${JSON.stringify(
            { defaultProvider: PROVIDER, defaultModel: model },
            null,
            2,
        )}\n`,
    };
}

export async function createSandbox({ models, model, env = {} }) {
    const wasmer = new Wasmer();
    const sandbox = await wasmer.sandboxes.create({
        packages: [PI_PACKAGE],
        files: piConfigFiles({ models, model }),
        env: {
            HOME: "/workspace",
            TERM: "xterm-256color",
            // Every Node process in the guest routes fetch through the bridge.
            NODE_OPTIONS: `--import=${SHIM_PATH}`,
            ...env,
        },
        network: { mode: "http" },
    });
    return { wasmer, sandbox };
}

/** Start Pi attached to a real terminal (stdin/stdout/stderr + resize). */
export async function startPi(
    sandbox,
    { model, columns = 100, rows = 30, env = {} } = {},
) {
    // env is passed per command as well as at sandbox creation: Pi must load
    // the fetch bridge before it makes its first model call, and not every
    // SDK version forwards creation-time env to every command.
    const process = await sandbox
        .command("pi", piArgs({ model }), {
            env: {
                HOME: "/workspace",
                TERM: "xterm-256color",
                NODE_OPTIONS: `--import=${SHIM_PATH}`,
                ...env,
            },
        })
        .spawn({ terminal: { columns, rows } });
    if (!process.stdin || !process.stdout) {
        throw new Error("Pi did not attach a terminal stream");
    }
    return process;
}

export async function wireTerminal(process, terminal) {
    terminal.onData((data) => void process.stdin.write(data));
    terminal.onResize(({ cols, rows }) => process.resizeTerminal(cols, rows));
    const pump = async (stream) => {
        for await (const chunk of stream) terminal.write(chunk);
    };
    void pump(process.stdout);
    void pump(process.stderr);
}
