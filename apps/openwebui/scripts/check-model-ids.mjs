#!/usr/bin/env node
/**
 * Every model id the container config references must exist in the live
 * Pollinations catalog, or the picker, the default chat model and the title /
 * tag / follow-up task silently fall back to something else (the old
 * `DEFAULT_MODELS: "openai"` was an alias, not an id, and every new chat landed
 * on the alphabetically first community model).
 *
 * Usage:
 *   node scripts/check-model-ids.mjs             # validate against catalog.fixture.json
 *   node scripts/check-model-ids.mjs --live      # validate against gen.pollinations.ai
 *   node scripts/check-model-ids.mjs --refresh   # rewrite the fixture from gen, then validate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    DEFAULT_MODELS,
    DEFAULT_PINNED_MODELS,
    TASK_MODEL_EXTERNAL,
} from "../config.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PATH = join(HERE, "..", "catalog.fixture.json");
const LIVE_URL = "https://gen.pollinations.ai/v1/models";

/** Every model id the container configuration points at. */
export function referencedModelIds() {
    return [
        ...new Set(
            [
                ...DEFAULT_MODELS.split(","),
                ...DEFAULT_PINNED_MODELS.split(","),
                TASK_MODEL_EXTERNAL,
            ]
                .map((id) => id.trim())
                .filter(Boolean),
        ),
    ];
}

/** @returns {string[]} referenced ids the catalog does not contain */
export function missingModelIds(referenced, catalogIds) {
    const known = new Set(catalogIds);
    return referenced.filter((id) => !known.has(id));
}

export function readFixture(path = FIXTURE_PATH) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/** Sorted, de-duplicated ids from the gateway's OpenAI-compatible list. */
export async function fetchLiveIds(url = LIVE_URL) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Fetching ${url} failed: ${response.status}`);
    }
    const body = await response.json();
    return [...new Set((body.data ?? []).map((model) => model.id))].sort();
}

function writeFixture(ids, path = FIXTURE_PATH) {
    const fixture = {
        source: LIVE_URL,
        fetchedAt: new Date().toISOString().slice(0, 10),
        count: ids.length,
        ids,
    };
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    return fixture;
}

async function main() {
    const args = new Set(process.argv.slice(2));
    const refresh = args.has("--refresh");
    const live = refresh || args.has("--live");
    const ids = live ? await fetchLiveIds() : readFixture().ids;
    if (refresh) writeFixture(ids);

    const referenced = referencedModelIds();
    const missing = missingModelIds(referenced, ids);
    if (missing.length > 0) {
        console.error(
            `Missing from the catalog (${missing.length}/${referenced.length}): ${missing.join(", ")}`,
        );
        process.exitCode = 1;
        return;
    }
    console.log(
        `OK: ${referenced.length} referenced model ids found in a ${ids.length}-model catalog (${live ? "live" : "fixture"})`,
    );
}

if (
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url
) {
    await main();
}
