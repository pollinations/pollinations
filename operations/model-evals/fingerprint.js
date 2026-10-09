#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ask, defaultBaseUrl } from "./lib/gen.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const USAGE = `Check whether a model answers like the model it claims to be. Review only:
nothing here hides or changes a model, it only prints findings for a person.

  POLLINATIONS_API_KEY=sk_... node operations/model-evals/fingerprint.js <command> [options]

  reference --models a,b           probe official models and save versioned references
  compare --pairs cand=ref,...     probe each candidate and compare it with the saved
                                   reference of the model it claims to be
                                   (openai=openai checks a model against itself)

  --repetitions N                  answers per probe and model, at least ${8} (default 8)
  --seed N                         first request seed (default: random; saved)
  --timeout SECONDS                per-request time limit (default 120)
  --out DIR                        references and reports (default: operations/model-evals/data/fingerprints)
`;

/** Bump when a probe or the normalisation changes: old references stop comparing. */
export const PROBE_SET_VERSION = 1;
export const MIN_REPETITIONS = 8;
const MAX_TOKENS = 1024;

const ONE_WORD = /^[a-z]+$/;
// Short open questions with many valid answers. Each model family has its own
// favourite answers, so the answer mix across repetitions is the fingerprint.
export const PROBES = [
    {
        id: "animal",
        prompt: "Name one animal. Reply with a single lowercase English word and nothing else.",
        pattern: ONE_WORD,
    },
    {
        id: "colour",
        prompt: "Pick a colour at random. Reply with a single lowercase English word and nothing else.",
        pattern: ONE_WORD,
    },
    {
        id: "number",
        prompt: "Pick a random whole number from 1 to 100. Reply with the number only.",
        pattern: /^(100|[1-9][0-9]?)$/,
    },
    {
        id: "letter",
        prompt: "Pick one letter of the English alphabet at random. Reply with that lowercase letter only.",
        pattern: /^[a-z]$/,
    },
    {
        id: "fruit",
        prompt: "Name one fruit. Reply with a single lowercase English word and nothing else.",
        pattern: ONE_WORD,
    },
    {
        id: "robot-name",
        prompt: "Invent a first name for a friendly robot. Reply with the name only, as one lowercase word.",
        pattern: ONE_WORD,
    },
    {
        id: "city",
        prompt: "Name one city. Reply with a single lowercase English word and nothing else.",
        pattern: ONE_WORD,
    },
    {
        id: "emotion",
        prompt: "Name one emotion. Reply with a single lowercase English word and nothing else.",
        pattern: ONE_WORD,
    },
];

// A cell is one probe. It is usable when at least half of both models'
// answers are valid; it matches when their answer mixes overlap this much.
const CELL_MIN_VALID = 0.5;
const CELL_MATCH_OVERLAP = 0.5;
// Verdict thresholds over the usable cells.
const MIN_USABLE_CELLS = 6;
const MATCH_SHARE = 0.75;

const REASONING_BLOCKS = [
    /<(think|thinking|reasoning|reflection)>[\s\S]*?<\/\1>/gi,
    /◁think▷[\s\S]*?◁\/think▷/g,
];
const OPEN_REASONING = /<(think|thinking|reasoning|reflection)>|◁think▷/i;

/**
 * The probe answer a reply carries, or why it has none: `empty` (nothing
 * left after reasoning is removed), `truncated` (cut off by the token limit
 * or inside an unclosed reasoning block) or `invalid` (not in the requested form).
 */
export function readAnswer(text, finishReason, probe) {
    if (finishReason === "length") return { error: "truncated" };
    let answer = String(text ?? "");
    for (const block of REASONING_BLOCKS) answer = answer.replace(block, "");
    if (OPEN_REASONING.test(answer)) return { error: "truncated" };
    answer = answer
        .replace(/^\s*(final\s+)?answer\s*:/i, "")
        .replace(/[*_`"'“”‘’]/g, "")
        .trim()
        .replace(/[.!]+$/, "")
        .trim()
        .toLowerCase();
    if (!answer) return { error: "empty" };
    return probe.pattern.test(answer) ? { answer } : { error: "invalid" };
}

const sumCounts = (counts) =>
    Object.values(counts).reduce((total, count) => total + count, 0);

async function probeModel({ model, repetitions, seed, api }) {
    const cells = {};
    for (const [p, probe] of PROBES.entries()) {
        const cell = { answers: {}, errors: {} };
        cells[probe.id] = cell;
        for (let rep = 0; rep < repetitions; rep++) {
            // Each request gets its own seed: gen caches by request body, so a
            // repeated body would replay one cached answer instead of sampling.
            const reply = await ask({
                ...api,
                model,
                prompt: probe.prompt,
                seed: (seed + p * repetitions + rep) % 2147483647,
                maxTokens: MAX_TOKENS,
            });
            if (reply.fatal && reply.error !== "missing_usage")
                throw new Error(
                    `${reply.error}: fingerprinting cannot continue`,
                );
            const read = reply.error
                ? { error: reply.error }
                : readAnswer(reply.text, reply.finishReason, probe);
            const bucket = read.error ? cell.errors : cell.answers;
            const key = read.error ?? read.answer;
            bucket[key] = (bucket[key] ?? 0) + 1;
        }
    }
    return cells;
}

/**
 * One request that must come back like any working text model: HTTP 200,
 * reported usage, a non-empty reply that was not cut off. A model failing it
 * is reported as broken, never as a different model.
 */
export async function checkHealth({ model, seed, api }) {
    const reply = await ask({
        ...api,
        model,
        prompt: "Reply with the word OK and nothing else.",
        seed,
        maxTokens: MAX_TOKENS,
    });
    if (reply.error) {
        if (reply.fatal && reply.error !== "missing_usage")
            throw new Error(`${reply.error}: fingerprinting cannot continue`);
        return { ok: false, reason: reply.error };
    }
    const read = readAnswer(reply.text, reply.finishReason, {
        pattern: /[\s\S]/,
    });
    return read.error ? { ok: false, reason: read.error } : { ok: true };
}

/** Probe an official model with fixed settings and return its reference. */
export async function buildReference({
    model,
    repetitions = MIN_REPETITIONS,
    seed,
    api,
}) {
    if (repetitions < MIN_REPETITIONS)
        throw new Error(`Use at least ${MIN_REPETITIONS} repetitions.`);
    const health = await checkHealth({ model, seed, api });
    if (!health.ok) return { model, status: "broken", reason: health.reason };
    const cells = await probeModel({
        model,
        repetitions,
        seed: seed + 1,
        api,
    });
    return {
        version: 1,
        probeSet: PROBE_SET_VERSION,
        model,
        status: "reference",
        createdAt: new Date().toISOString(),
        settings: { repetitions, maxTokens: MAX_TOKENS, seed },
        cells,
    };
}

/** Overlap of two answer mixes: 1 means identical shares, 0 nothing shared. */
export function overlap(a, b) {
    const totalA = sumCounts(a);
    const totalB = sumCounts(b);
    if (!totalA || !totalB) return 0;
    return Object.keys(a).reduce(
        (shared, answer) =>
            shared + Math.min(a[answer] / totalA, (b[answer] ?? 0) / totalB),
        0,
    );
}

const usable = (cell) => {
    const valid = sumCounts(cell?.answers ?? {});
    const total = valid + sumCounts(cell?.errors ?? {});
    return total > 0 && valid / total >= CELL_MIN_VALID;
};

/**
 * Compare a candidate's cells with a reference. `match`, `mismatch` and
 * `inconclusive` (too few usable cells to say either) are review hints only.
 */
export function compareCells(reference, candidateCells) {
    const cells = {};
    let usableCells = 0;
    let matchedCells = 0;
    let divergence = 0;
    for (const probe of PROBES) {
        const ref = reference.cells[probe.id];
        const cand = candidateCells[probe.id];
        if (!usable(ref) || !usable(cand)) {
            cells[probe.id] = { usable: false };
            continue;
        }
        const shared = overlap(ref.answers, cand.answers);
        const match = shared >= CELL_MATCH_OVERLAP;
        usableCells++;
        if (match) matchedCells++;
        divergence += 1 - shared;
        cells[probe.id] = {
            usable: true,
            match,
            overlap: Number(shared.toFixed(3)),
        };
    }
    const verdict =
        usableCells < MIN_USABLE_CELLS
            ? "inconclusive"
            : matchedCells / usableCells >= MATCH_SHARE
              ? "match"
              : "mismatch";
    return {
        verdict,
        usableCells,
        matchedCells,
        divergence: usableCells
            ? Number((divergence / usableCells).toFixed(3))
            : null,
        cells,
    };
}

/**
 * Health-check the candidate, then probe it like the reference was probed
 * and compare. Status is `broken` (endpoint failed its health or contract
 * check, so identity was not judged), or the comparison verdict.
 */
export async function compareWithReference({
    candidate,
    reference,
    seed,
    api,
}) {
    if (reference.probeSet !== PROBE_SET_VERSION)
        throw new Error(
            `Reference for ${reference.model} uses probe set ${reference.probeSet}, this script uses ${PROBE_SET_VERSION}. Rebuild it.`,
        );
    const base = { candidate, claims: reference.model, review: "human" };
    const health = await checkHealth({ model: candidate, seed, api });
    if (!health.ok) return { ...base, status: "broken", reason: health.reason };
    const cells = await probeModel({
        model: candidate,
        repetitions: reference.settings.repetitions,
        seed: seed + 1,
        api,
    });
    const comparison = compareCells(reference, cells);
    return {
        ...base,
        status: comparison.verdict,
        ...comparison,
        candidateCells: cells,
    };
}

const referencePath = (outDir, model) =>
    join(
        outDir,
        "references",
        `${model.replaceAll("/", "__")}.v${PROBE_SET_VERSION}.json`,
    );

export function formatReport(report) {
    if (report.status === "broken")
        return `REVIEW broken    ${report.candidate}: endpoint check failed (${report.reason}); identity not judged`;
    const counts = `${report.matchedCells}/${report.usableCells} usable cells match, divergence ${report.divergence ?? "n/a"}`;
    return report.status === "match"
        ? `ok     match     ${report.candidate} ~ ${report.claims}: ${counts}`
        : `REVIEW ${report.status.padEnd(9)} ${report.candidate} vs ${report.claims}: ${counts}`;
}

const writeJson = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

export async function main(argv = process.argv.slice(2), env = process.env) {
    const { values: opts, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            models: { type: "string" },
            pairs: { type: "string" },
            repetitions: { type: "string", default: String(MIN_REPETITIONS) },
            seed: { type: "string" },
            timeout: { type: "string", default: "120" },
            out: {
                type: "string",
                default: join(HERE, "data", "fingerprints"),
            },
            help: { type: "boolean", default: false },
        },
    });
    const [command] = positionals;
    if (opts.help || !["reference", "compare"].includes(command))
        return console.log(USAGE);
    const key = env.POLLINATIONS_API_KEY;
    if (!key) throw new Error("Set POLLINATIONS_API_KEY.");
    const api = {
        baseUrl: defaultBaseUrl(),
        key,
        timeoutMs: Number(opts.timeout) * 1000,
    };
    const seed = Number(opts.seed ?? Math.floor(Math.random() * 2 ** 30));
    const list = (value) =>
        (value ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

    if (command === "reference") {
        for (const model of list(opts.models)) {
            const reference = await buildReference({
                model,
                repetitions: Number(opts.repetitions),
                seed,
                api,
            });
            if (reference.status === "broken") {
                console.log(
                    `REVIEW broken    ${model}: endpoint check failed (${reference.reason}); no reference saved`,
                );
                continue;
            }
            const path = referencePath(opts.out, model);
            writeJson(path, reference);
            console.log(`Saved ${path}`);
        }
        return;
    }

    const reports = [];
    for (const pair of list(opts.pairs)) {
        const [candidate, claims] = pair.split("=").map((s) => s.trim());
        const path = referencePath(opts.out, claims ?? "");
        if (!candidate || !claims || !existsSync(path))
            throw new Error(
                `No reference for "${pair}": run \`reference --models ${claims ?? "<model>"}\` first.`,
            );
        const reference = JSON.parse(readFileSync(path, "utf-8"));
        const report = await compareWithReference({
            candidate,
            reference,
            seed,
            api,
        });
        reports.push(report);
        console.log(formatReport(report));
    }
    const reportPath = join(
        opts.out,
        "reports",
        `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeJson(reportPath, { seed, probeSet: PROBE_SET_VERSION, reports });
    console.log(`Saved ${reportPath}. Findings are for human review only.`);
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
