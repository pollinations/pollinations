import {
    createHash,
    randomBytes,
    scryptSync,
    timingSafeEqual,
} from "node:crypto";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { isMap, isNode, isPair, isSeq, parseDocument } from "yaml";
import polliSkill from "../../SKILL.md?raw";
import { BASE_URL } from "../lib/config.js";
import { ownedEntryNames, upsertEnvFile } from "../mcp/config-files.js";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "./fs.js";
import { resolveHarnessKey } from "./keys.js";
import { fetchHarnessModels } from "./models.js";
import {
    applyWithSnapshot,
    restoreOrStrip,
    snapshotBefore,
} from "./snapshot.js";
import type {
    HarnessAdapter,
    HarnessContext,
    HarnessModel,
    HarnessResult,
} from "./types.js";

const ID = "hermes";
const LABEL = "Hermes Agent";
const PROVIDER = "pollinations";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const KEY_ENV = "POLLI_HERMES_API_KEY";
const PROVIDER_NAME = "Pollinations";
const PROVIDER_URL = `${BASE_URL}/v1`;

const PROVIDER_PATH = ["providers", PROVIDER];
const MODEL_PROVIDER_PATH = ["model", "provider"];
const MODEL_DEFAULT_PATH = ["model", "default"];
const MCP_PATH = ["mcp_servers"];
// Never fold long scalars across lines.
const YAML_OUT = { lineWidth: 0 };

export const hermesHome = (ctx: HarnessContext): string => {
    const configured = ctx.env.HERMES_HOME;
    if (!configured?.trim()) return join(ctx.home, ".hermes");
    return resolveHomePath(ctx.home, configured);
};

const configPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "config.yaml");
const envPath = (ctx: HarnessContext) => join(hermesHome(ctx), ".env");
// Hermes auto-discovers SKILL.md files from $HERMES_HOME/skills/ subdirectories.
const skillPath = (ctx: HarnessContext) =>
    join(hermesHome(ctx), "skills", "polli", "SKILL.md");

const files = (ctx: HarnessContext) => [
    configPath(ctx),
    envPath(ctx),
    skillPath(ctx),
];

// The values the last `on` wrote, kept outside the config so `off` can tell
// "still ours" apart from "edited by the user". The key is stored as a
// salted scrypt fingerprint only - the state file must not grow a second
// copy of the secret.
interface WrittenState {
    model: string;
    models: string[];
    keySalt: string;
    keyHash: string;
}

// Scoped to the resolved target files, like the snapshot journal, so two
// HERMES_HOME installations never share ownership state.
const statePath = (ctx: HarnessContext) => {
    const key = sha256(files(ctx).join("\n")).slice(0, 12);
    return join(
        ctx.home,
        ".pollinations",
        "harnesses",
        `hermes.written.${key}.json`,
    );
};

const readWritten = (ctx: HarnessContext): WrittenState | null => {
    const text = readTextIfExists(statePath(ctx));
    if (!text?.trim()) return null;
    try {
        const parsed = JSON.parse(text) as Partial<WrittenState>;
        if (
            typeof parsed.model !== "string" ||
            !Array.isArray(parsed.models) ||
            typeof parsed.keySalt !== "string" ||
            typeof parsed.keyHash !== "string"
        ) {
            return null;
        }
        return parsed as WrittenState;
    } catch {
        return null;
    }
};

const writeWritten = (ctx: HarnessContext, state: WrittenState) =>
    writeTextAtomic(
        statePath(ctx),
        `${JSON.stringify(state, null, 2)}\n`,
        0o600,
    );

const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");

// Ownership fingerprint for the written key: a salted memory-hard KDF, so
// the state file never holds the secret and a leaked fingerprint is not
// brute-forceable the way a bare fast hash would be.
const keyFingerprint = (apiKey: string, salt: string) =>
    scryptSync(apiKey, salt, 32).toString("hex");

const keyMatches = (value: string, written: WrittenState) => {
    const candidate = Buffer.from(
        keyFingerprint(value, written.keySalt),
        "hex",
    );
    const stored = Buffer.from(written.keyHash, "hex");
    return (
        candidate.length === stored.length && timingSafeEqual(candidate, stored)
    );
};

/**
 * Quote-aware tokenizer for dotenv text. Returns logical entries in file
 * order: assignments carry every physical line of their span plus the fully
 * parsed value (continuation lines of an unclosed quoted value belong to
 * that value, never to a separate assignment); anything else is an entry
 * with `key: null`. One scanner backs every ownership decision - removal,
 * snapshot lookup and survival checks all see the same logical lines.
 */
interface DotenvEntry {
    key: string | null;
    lines: string[];
    value: string;
}

const dotenvEntries = (text: string): DotenvEntry[] => {
    // parseEnv accepts dotted and hyphenated names, so assignment-boundary
    // recognition must too - otherwise a foreign quoted span stays invisible
    // and its content lines look like standalone assignments.
    const assignmentLine = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/u;
    const entries: DotenvEntry[] = [];
    let pending: {
        key: string;
        lines: string[];
        raw: string;
        quote: string;
    } | null = null;
    const flush = () => {
        if (!pending) return;
        entries.push({
            key: pending.key,
            lines: pending.lines,
            value: parseEnv(`K=${pending.raw}`).K ?? pending.raw.trim(),
        });
        pending = null;
    };
    for (const line of text.split("\n")) {
        if (pending) {
            pending.lines.push(line);
            pending.raw += `\n${line}`;
            if (line.includes(pending.quote)) flush();
            continue;
        }
        const match = assignmentLine.exec(line);
        if (!match) {
            entries.push({ key: null, lines: [line], value: "" });
            continue;
        }
        const trimmed = match[2].trim();
        const opener =
            trimmed.startsWith('"') ||
            trimmed.startsWith("'") ||
            trimmed.startsWith("`")
                ? trimmed[0]
                : null;
        if (opener !== null && !trimmed.slice(1).includes(opener)) {
            pending = {
                key: match[1],
                lines: [line],
                raw: match[2],
                quote: opener,
            };
            continue;
        }
        entries.push({
            key: match[1],
            lines: [line],
            value: parseEnv(`K=${match[2]}`).K ?? trimmed,
        });
    }
    flush();
    return entries;
};

const dotenvAssignments = (
    text: string,
    name: string,
): { lines: string[]; value: string }[] =>
    dotenvEntries(text)
        .filter((entry) => entry.key === name)
        .map(({ lines, value }) => ({ lines, value }));

// parseDocument keeps comments and untouched entries intact on rewrite.
const loadYaml = (path: string) => {
    const text = readTextIfExists(path);
    const doc = parseDocument(text?.trim() ? text : "{}");
    if (doc.errors.length > 0) {
        throw new Error(
            `${path} is not valid YAML (${doc.errors[0].message}). Fix it by hand - polli will not rewrite a broken config.`,
        );
    }
    return doc;
};

const loadBeforeYaml = (text: string | null | undefined) => {
    if (!text?.trim()) return null;
    const doc = parseDocument(text);
    return doc.errors.length > 0 ? null : doc;
};

/** First usable URL among the key spellings Hermes accepts. */
const providerUrl = (entry: {
    get: (key: string) => unknown;
}): string | null => {
    for (const key of ["base_url", "url", "api"]) {
        const value = entry.get(key);
        if (typeof value === "string" && value) return value;
    }
    return null;
};

const providerBlock = (models: HarnessModel[]) => ({
    name: PROVIDER_NAME,
    base_url: PROVIDER_URL,
    key_env: KEY_ENV,
    models: models.map((model) => model.id),
});

const readKey = (ctx: HarnessContext): string | null => {
    const text = readTextIfExists(envPath(ctx));
    if (text === null) return null;
    const key = parseEnv(text)[KEY_ENV];
    return key || null;
};

const sameJson = (a: unknown, b: unknown) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Plain JS for a YAML node (collections come back as nodes, scalars as JS). */
const toPlain = (value: unknown): unknown =>
    isNode(value) ? (value as { toJSON(): unknown }).toJSON() : value;

/** Force block style on a created node tree (never flow `{ a: b }` config). */
const setBlockStyle = (node: unknown) => {
    if (isMap(node) || isSeq(node)) {
        node.flow = false;
        for (const item of node.items) {
            if (isPair(item)) {
                setBlockStyle(item.key);
                setBlockStyle(item.value);
            } else {
                setBlockStyle(item);
            }
        }
    }
};

interface HermesSettings {
    apiKey: string;
    model: string;
    models: HarnessModel[];
}

const writeConfig = (ctx: HarnessContext, settings: HermesSettings) => {
    const doc = loadYaml(configPath(ctx));
    if (!isMap(doc.contents)) {
        throw new Error(`${configPath(ctx)} must contain a YAML mapping`);
    }
    // A fresh file starts as the flow-style "{}" placeholder - write block.
    doc.contents.flow = false;

    // Never overwrite the user's own provider entry that points elsewhere.
    const existing = doc.getIn(PROVIDER_PATH, true);
    if (existing !== undefined) {
        if (!isMap(existing) || providerUrl(existing) !== PROVIDER_URL) {
            throw new Error(
                `${configPath(ctx)} already has a providers.${PROVIDER} entry pointing at a different endpoint. Remove or rename it by hand, then re-run: polli harness ${ID} on`,
            );
        }
        // Same endpoint: merge our fields in, keeping foreign extras
        // (a hand-added api_key, custom headers) the user already had.
        // Values that already match are left as-is so their comments survive.
        existing.flow = false;
        const block = providerBlock(settings.models);
        for (const [field, value] of Object.entries(block)) {
            if (sameJson(toPlain(existing.get(field, true)), value)) continue;
            const node = doc.createNode(value);
            setBlockStyle(node);
            existing.set(field, node);
        }
    } else {
        const node = doc.createNode(providerBlock(settings.models));
        setBlockStyle(node);
        doc.setIn(PROVIDER_PATH, node);
    }
    const providersMap = doc.get("providers", true);
    if (isMap(providersMap)) providersMap.flow = false;
    doc.setIn(MODEL_PROVIDER_PATH, PROVIDER);
    doc.setIn(MODEL_DEFAULT_PATH, settings.model);
    writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);

    // Hermes resolves provider key_env values from $HERMES_HOME/.env.
    upsertEnvFile(envPath(ctx), { [KEY_ENV]: settings.apiKey });

    if (readTextIfExists(skillPath(ctx)) === null) {
        writeTextAtomic(skillPath(ctx), polliSkill, 0o600);
    }

    const keySalt = randomBytes(16).toString("hex");
    writeWritten(ctx, {
        model: settings.model,
        models: settings.models.map((model) => model.id),
        keySalt,
        keyHash: keyFingerprint(settings.apiKey, keySalt),
    });
};

/** Remove a top-level key that became empty and did not exist before `on`. */
const deleteIfEmptied = (
    doc: ReturnType<typeof loadYaml>,
    before: ReturnType<typeof loadBeforeYaml>,
    key: string,
): boolean => {
    const node = doc.get(key, true);
    if (!isMap(node) || node.items.length > 0) return false;
    if (before?.has(key)) return false;
    doc.delete(key);
    return true;
};

const stripConfig = (ctx: HarnessContext): boolean => {
    const owned = files(ctx);
    const written = readWritten(ctx);
    const before = loadBeforeYaml(
        snapshotBefore(ctx, ID, owned, configPath(ctx)),
    );
    const beforeEnv = snapshotBefore(ctx, ID, owned, envPath(ctx));
    let changed = false;

    // config.yaml - per-field ownership: a field is restored to its pre-`on`
    // value (or deleted when there was none) ONLY while it still holds the
    // value we wrote; later user edits survive `off`.
    const doc = loadYaml(configPath(ctx));
    if (isMap(doc.contents)) {
        const entry = doc.getIn(PROVIDER_PATH, true);
        if (isMap(entry)) {
            const beforeEntry = before?.getIn(PROVIDER_PATH, true);
            const beforeEntryMap = isMap(beforeEntry) ? beforeEntry : null;
            // A foreign entry pointing elsewhere is never touched.
            if (
                providerUrl(entry) === PROVIDER_URL ||
                (beforeEntryMap && providerUrl(beforeEntryMap) === PROVIDER_URL)
            ) {
                const ours: Record<string, unknown> = {
                    name: PROVIDER_NAME,
                    base_url: PROVIDER_URL,
                    key_env: KEY_ENV,
                    ...(written ? { models: written.models } : {}),
                };
                for (const [field, value] of Object.entries(ours)) {
                    if (!sameJson(toPlain(entry.get(field, true)), value))
                        continue;
                    if (beforeEntryMap?.has(field)) {
                        const beforeValue = beforeEntryMap.get(field, true);
                        if (sameJson(toPlain(beforeValue), value)) {
                            // The pre-`on` value equals ours: `on` kept the
                            // original node, so there is nothing to restore
                            // (and its comments survive).
                            continue;
                        }
                        entry.set(field, doc.createNode(toPlain(beforeValue)));
                    } else {
                        entry.delete(field);
                    }
                    changed = true;
                }
                if (entry.items.length === 0) {
                    doc.deleteIn(PROVIDER_PATH);
                    changed = true;
                }
                changed = deleteIfEmptied(doc, before, "providers") || changed;
            }
        }

        // model.provider and model.default are owned independently: each is
        // restored/deleted only while it still holds the value we wrote.
        if (doc.getIn(MODEL_PROVIDER_PATH) === PROVIDER) {
            if (before?.hasIn(MODEL_PROVIDER_PATH)) {
                doc.setIn(
                    MODEL_PROVIDER_PATH,
                    before.getIn(MODEL_PROVIDER_PATH),
                );
            } else {
                doc.deleteIn(MODEL_PROVIDER_PATH);
            }
            changed = true;
        }
        if (written && sameJson(doc.getIn(MODEL_DEFAULT_PATH), written.model)) {
            if (before?.hasIn(MODEL_DEFAULT_PATH)) {
                doc.setIn(MODEL_DEFAULT_PATH, before.getIn(MODEL_DEFAULT_PATH));
            } else {
                doc.deleteIn(MODEL_DEFAULT_PATH);
            }
            changed = true;
        }
        changed = deleteIfEmptied(doc, before, "model") || changed;

        if (changed) {
            const empty =
                !doc.contents ||
                (isMap(doc.contents) && doc.contents.items.length === 0);
            if (empty && before === null) {
                removeIfExists(configPath(ctx));
            } else {
                writeTextAtomic(configPath(ctx), doc.toString(YAML_OUT), 0o600);
            }
        }
    }

    // .env - ownership over logical entries (one quote-aware scanner for
    // removal, snapshot lookup and survival checks). An assignment goes only
    // while its own fully parsed value still matches the key we wrote - a
    // multiline span is kept, removed or replaced as a whole. A pre-existing
    // assignment with the same value (a key `on` reused) keeps the original
    // lines verbatim; a displaced pre-existing assignment is restored only
    // when this strip actually removed an owned assignment (an assignment
    // the user deliberately deleted is never resurrected).
    const envText = readTextIfExists(envPath(ctx));
    if (envText !== null && written) {
        const beforeKeyLines = beforeEnv
            ? dotenvAssignments(beforeEnv, KEY_ENV)
            : [];
        let touched = false;
        let removedOwned = false;
        let survivingKey = false;
        const kept: string[] = [];
        for (const entry of dotenvEntries(envText)) {
            if (entry.key !== KEY_ENV) {
                kept.push(...entry.lines);
                continue;
            }
            if (!keyMatches(entry.value, written)) {
                survivingKey = true;
                kept.push(...entry.lines); // foreign value, never ours
                continue;
            }
            touched = true;
            // An identical assignment existed before `on`: keep the original
            // lines verbatim instead of deleting it.
            const beforeIndex = beforeKeyLines.findIndex(
                (before) => before.value === entry.value,
            );
            if (beforeIndex >= 0) {
                survivingKey = true;
                kept.push(...beforeKeyLines.splice(beforeIndex, 1)[0].lines);
            } else {
                removedOwned = true;
            }
        }
        // `on` collapsed pre-existing assignments into ours; restore a
        // displaced one only when this strip removed an owned assignment and
        // no other assignment survives.
        if (removedOwned && beforeKeyLines.length > 0 && !survivingKey) {
            const insertAt = kept.at(-1) === "" ? kept.length - 1 : kept.length;
            kept.splice(
                insertAt,
                0,
                ...beforeKeyLines.flatMap((before) => before.lines),
            );
        }
        if (touched) {
            if (kept.every((line) => line.trim() === "") && !beforeEnv) {
                removeIfExists(envPath(ctx));
            } else {
                writeTextAtomic(envPath(ctx), kept.join("\n"), 0o600);
            }
            changed = true;
        }
    }

    // The skill goes only if this `on` created it (no before-content); a copy
    // the user had installed by hand survives even with identical content.
    const beforeSkill = snapshotBefore(ctx, ID, owned, skillPath(ctx));
    if (
        beforeSkill === null &&
        readTextIfExists(skillPath(ctx)) === polliSkill
    ) {
        removeIfExists(skillPath(ctx));
        changed = true;
    }

    return changed;
};

const hasMcp = (ctx: HarnessContext): boolean => {
    try {
        const doc = loadYaml(configPath(ctx));
        const table = doc.getIn(MCP_PATH, true);
        if (!isMap(table)) return false;
        return ownedEntryNames(table.toJSON()).length > 0;
    } catch {
        return false;
    }
};

const result = (ctx: HarnessContext): HarnessResult => {
    let providerOk = false;
    let modelProviderOk = false;
    let model: string | undefined;
    try {
        const doc = loadYaml(configPath(ctx));
        const entry = doc.getIn(PROVIDER_PATH, true);
        providerOk =
            isMap(entry) &&
            providerUrl(entry) === PROVIDER_URL &&
            entry.get("key_env") === KEY_ENV;
        modelProviderOk = doc.getIn(MODEL_PROVIDER_PATH) === PROVIDER;
        const configured = doc.getIn(MODEL_DEFAULT_PATH);
        model = typeof configured === "string" ? configured : undefined;
    } catch {
        // A broken config is reported as "not configured", never thrown.
    }

    return {
        harness: ID,
        label: LABEL,
        configured:
            providerOk &&
            modelProviderOk &&
            readKey(ctx) !== null &&
            readTextIfExists(skillPath(ctx)) !== null,
        model,
        mcp: hasMcp(ctx),
        files: files(ctx),
    };
};

export const configureHermes = (
    ctx: HarnessContext,
    settings: HermesSettings,
): HarnessResult => {
    applyWithSnapshot(ctx, ID, files(ctx), () => writeConfig(ctx, settings));
    return result(ctx);
};

export const disableHermes = (ctx: HarnessContext): HarnessResult => {
    const outcome = restoreOrStrip(ctx, ID, files(ctx), () => stripConfig(ctx));
    removeIfExists(statePath(ctx));
    return { ...result(ctx), configured: false, outcome };
};

export const hermes: HarnessAdapter = {
    id: ID,
    label: LABEL,
    description: "Configure Hermes Agent as a Pollinations provider",
    restartHint:
        "Changes apply on the next Hermes session. Start Hermes with: hermes",

    async on(ctx, options) {
        if (
            !commandExists("hermes", ctx.env, [
                join(ctx.home, ".local", "bin", "hermes"),
            ])
        ) {
            throw new Error(
                "Hermes Agent was not found. Install it first: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash - then re-run: polli harness hermes on",
            );
        }
        const model = options.model ?? DEFAULT_MODEL;
        const models = await fetchHarnessModels(model);

        const apiKey = await resolveHarnessKey(
            { id: ID, label: LABEL, existingKey: readKey(ctx) },
            { browser: options.browser },
        );
        return configureHermes(ctx, { apiKey, model, models });
    },

    off: disableHermes,
    status: result,
};
