// Boots the browser-side Pi sandbox and runs Pi inside it.
//
// The sandbox is a real WASIX runtime (@wasmer/sdk) running the published
// `wasmer/pi` package, so this is the actual Pi coding agent, not a mock.
// Networking is disabled and every outbound HTTP call is answered by the
// host-side bridge.

import { Wasmer } from "@wasmer/sdk";
import { createBridge } from "./bridge.js";
import {
    FALLBACK_MODELS,
    GUEST,
    PI_PACKAGE,
    buildAuthJson,
    buildModelsJson,
    buildPiArgs,
    buildSettingsJson,
    parsePiEvents,
} from "./piConfig.js";

export class PiSession {
    constructor() {
        this.wasmer = new Wasmer();
        this.sandbox = null;
        this.bridge = null;
        this.apiKey = null;
    }

    async boot({ apiKey, models, onEvent = () => {}, onProgress = () => {} }) {
        this.apiKey = apiKey;
        this.models = models ?? FALLBACK_MODELS;
        this.model = this.models[0]?.id ?? FALLBACK_MODELS[0].id;
        onEvent({ type: "status", message: "loading runtime (first run downloads ~35 MB)" });

        const pkg = await this.wasmer.packages.load(PI_PACKAGE, {
            onProgress: (progress) =>
                onProgress({ phase: progress.phase, percent: progress.download?.percent }),
        });

        onEvent({ type: "status", message: "starting sandbox" });
        this.sandbox = await this.wasmer.sandboxes.create({
            packages: [pkg],
            // No network: Pi must go through the bridge so the Pollen key
            // never enters the guest.
            network: { mode: "disabled" },
            env: { HOME: GUEST.home },
        });

        await this.#installGuest();
        this.bridge = createBridge({
            sandbox: this.sandbox,
            getApiKey: () => this.apiKey,
            onEvent,
        });
        onEvent({ type: "status", message: "ready" });
    }

    async #installGuest() {
        const fs = this.sandbox.fs;
        await fs.mkdir(GUEST.agentDir, { recursive: true });
        await fs.mkdir(GUEST.bridgeDir, { recursive: true });
        await fs.writeText(
            GUEST.extensionPath,
            await loadGuestAsset("guest/bridge.mjs"),
        );
        await fs.writeText(GUEST.modelsPath, JSON.stringify(buildModelsJson(this.models), null, 2));
        await fs.writeText(GUEST.authPath, JSON.stringify(buildAuthJson(), null, 2));
        await fs.writeText(GUEST.settingsPath, JSON.stringify(buildSettingsJson(), null, 2));
    }

    async run(prompt, { model, onEvent = () => {} } = {}) {
        const args = buildPiArgs({ prompt, model });
        onEvent({ type: "pi-start", args });
        const output = await this.sandbox
            .command("pi", args)
            .run({ check: false })
            .catch((error) => ({ stdout: { text: () => "" }, stderr: { text: () => String(error) }, exitCode: -1 }));
        return {
            exitCode: output.exitCode,
            stdout: output.stdout.text(),
            stderr: output.stderr.text(),
            events: parsePiEvents(output.stdout.text()),
        };
    }

    async listFiles(dir = GUEST.home) {
        const walk = async (path, depth) => {
            if (depth > 3) return [];
            let entries = [];
            try {
                entries = await this.sandbox.fs.readDir(path);
            } catch {
                return [];
            }
            const out = [];
            for (const entry of entries) {
                const full = `${path}/${entry.name}`;
                if (entry.kind === "directory") {
                    out.push({ path: full, kind: "directory" });
                    out.push(...(await walk(full, depth + 1)));
                } else {
                    out.push({ path: full, kind: "file", size: entry.size });
                }
            }
            return out;
        };
        return walk(dir, 0);
    }

    async readText(path) {
        return this.sandbox.fs.readText(path);
    }

    async destroy() {
        await this.bridge?.stop();
        await this.sandbox?.close();
        await this.wasmer.close();
    }
}

// Guest scripts are served as plain files from the app root; fetch them so the
// same source works in dev and in the built output.
async function loadGuestAsset(path) {
    const response = await fetch(new URL(`../${path}`, import.meta.url));
    if (!response.ok) throw new Error(`cannot load ${path}: ${response.status}`);
    return response.text();
}
