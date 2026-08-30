import { join } from "node:path";
import { execSync } from "node:child_process";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    clearSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "prime";
const LABEL = "Prime Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "openai";

const isPrimeInstalled = (): boolean => {
    try {
        execSync("prime-agent --version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

const extensionPath = (ctx: HarnessContext) =>
    join(ctx.home, ".prime", "agent", "extensions", "pollinations.ts");
const skillPath = (ctx: HarnessContext) =>
    join(ctx.home, ".prime", "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [extensionPath(ctx), skillPath(ctx)];

const extensionSource = (apiKey: string, models: HarnessModel[]) => `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function(pi: ExtensionAPI) {
  pi.registerProvider("${PROVIDER}", {
    name: "Pollinations",
    baseUrl: "${BASE_URL}/v1",
    apiKey: ${JSON.stringify(apiKey)},
    api: "openai-completions",
    models: ${JSON.stringify(
        models.map((m) => ({
            id: m.id,
            name: m.id,
            contextWindow: m.contextWindow,
            input: m.input,
        })),
        null,
        2,
    )},
  });
}
`;

const ensurePrimeInstalled = () => {
    if (isPrimeInstalled()) return;
    const msg = [
        "Prime Agent is not installed.",
        "Install it first with:",
        "  curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh",
        "Then run: polli harness prime on",
    ].join("\n");
    throw new Error(msg);
};

interface PrimeSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writePrimeExtension = (ctx: HarnessContext, settings: PrimeSettings) => {
    writeTextAtomic(
        extensionPath(ctx),
        extensionSource(settings.apiKey, settings.models),
        0o600,
    );
    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }
};

const stripPrimeExtension = (ctx: HarnessContext): boolean => {
    let changed = false;
    if (removeIfExists(extensionPath(ctx))) changed = true;
    // Also try legacy Pi extension location for clean migration
    const legacy = join(ctx.home, ".prime", "agent", "extensions", "polli.ts");
    if (removeIfExists(legacy)) changed = true;
    if (readTextIfExists(skillPath(ctx)) === polliSkill) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }
    return changed;
};

const result = (ctx: HarnessContext): HarnessResult => {
    const hasExtension = readTextIfExists(extensionPath(ctx)) !== null;
    const hasSkill = readTextIfExists(skillPath(ctx)) !== null;
    // Try to read the default model from the extension source if present
    let model: string | undefined;
    const text = readTextIfExists(extensionPath(ctx));
    if (text) {
        const match = text.match(/"id":\s*"([^"]+)"/);
        if (match) model = undefined;
    }
    return {
        harness: ID,
        label: LABEL,
        configured: hasExtension && hasSkill,
        model,
        files: files(ctx),
    };
};

export const configurePrime = (
    ctx: HarnessContext,
    settings: PrimeSettings,
): HarnessResult => {
    ensurePrimeInstalled();
    applyWithSnapshot(ctx, ID, files(ctx), () => writePrimeExtension(ctx, settings));
    return result(ctx);
};

export const disablePrime = (ctx: HarnessContext): HarnessResult => {
    const managedFiles = files(ctx);
    let outcome: HarnessResult["outcome"] = "restored";
    if (restoreSnapshot(ctx, ID, managedFiles) !== "restored") {
        outcome = stripPrimeExtension(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, ID, managedFiles);
    }
    return { ...result(ctx), configured: false, outcome };
};

export const prime: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Prime Agent to use Pollinations",
    restartHint: "Run prime-agent again — the Pollinations provider is ready.",

    async on(ctx, options) {
        ensurePrimeInstalled();
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels();
        if (!models.some((m) => m.id === model)) {
            throw new Error(`Model "${model}" is not a tool-calling text model. Run: polli models`);
        }
        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: null },
            { browser: options.browser },
        );
        return configurePrime(ctx, { apiKey, model, models });
    },

    off: disablePrime,
    status: result,
};
