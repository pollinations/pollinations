#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ask, defaultBaseUrl } from "./lib/gen.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Fixed inputs whose reported prompt tokens are compared. Bump the version
 * when they change, so reports from different corpora are not mixed up.
 */
export const CORPUS_VERSION = 1;
export const CORPUS = [
    "Hello, world!",
    "The quick brown fox jumps over the lazy dog.",
    "1234567890123456789012345678901234567890",
    "안녕하세요. 폴리네이션 핑거프린트 테스트입니다.",
    "こんにちは、世界。これはテストです。",
    "你好，世界。这是一个测试。",
    "🚀🧪🔬✨🎯🧩🔥💡",
    "def compute(x):\n    return x ** 2 if x else None",
    "https://gen.pollinations.ai/v1/chat/completions?model=x&seed=42#frag",
    "SELECT id, name FROM users WHERE created_at > '2026-01-01' ORDER BY name;",
    "   multiple    spaces     and\ttabs\n\nnewlines   ",
    "CamelCaseIdentifierWithLongName123",
    "Ünïcödé áçcents èñçödé",
    "0123456789",
    "a".repeat(200),
    "MiXeD cAsE sEnTeNcEs AnD nUmBeRs 42",
];

const USAGE = `Compare the input usage that gen reports for a candidate and a reference model.

  POLLINATIONS_API_KEY=sk_... node operations/model-evals/usage-probe.js --pairs candidate=reference[,...] [options]

  --pairs a=b,c=d     candidate=reference model pairs, e.g. community/x/gpt-6.1-sol=openai
  --seed N            request seed (default: random; printed and saved)
  --timeout SECONDS   per-request time limit (default 120)
  --out DIR           results directory (default: operations/model-evals/data)
  --dry-run           print the corpus and pairs, call nothing

Sends the ${CORPUS.length}-item corpus once to each model (max_tokens 16) and reports,
per pair: the median and range of the reported prompt-token delta. The reasons
for items that could not be compared and the usage fields each side returns
are saved in the report.
Review-only: token counts and usage fields can differ because of wrappers,
request formatting, routing or accounting, so they never prove what a model
received and nothing here hides a model.
`;

const chars = (text) => [...text].length;

export function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Dotted paths of every field in a usage object, e.g. `prompt_tokens_details.cached_tokens`. */
export function usageFields(usage, prefix = "") {
    return Object.entries(usage ?? {}).flatMap(([key, value]) =>
        value && typeof value === "object" && !Array.isArray(value)
            ? usageFields(value, `${prefix}${key}.`)
            : [`${prefix}${key}`],
    );
}

/** Reported usage for every corpus item. Our own 401/402/403 stops the run. */
export async function probeModel({ model, seed, api }) {
    const items = [];
    for (const [index, text] of CORPUS.entries()) {
        const reply = await ask({
            ...api,
            model,
            prompt: text,
            seed: (seed + index) % 2147483647,
            maxTokens: 16,
        });
        if (reply.fatal && reply.error !== "missing_usage")
            throw new Error(`${reply.error}: usage probe cannot continue`);
        items.push({
            chars: chars(text),
            usage: reply.usage ?? null,
            error: reply.usage ? undefined : reply.error,
        });
    }
    return items;
}

const fieldsOf = (items) =>
    [...new Set(items.flatMap((item) => usageFields(item.usage)))].sort();

/** Pure comparison of two probe results. */
export function compareUsage(candidate, reference) {
    const perItem = CORPUS.map((text, index) => {
        const c = candidate[index].usage?.prompt_tokens;
        const r = reference[index].usage?.prompt_tokens;
        return {
            preview: text.slice(0, 32),
            chars: chars(text),
            candidate: Number.isFinite(c) ? c : null,
            reference: Number.isFinite(r) ? r : null,
            delta: Number.isFinite(c) && Number.isFinite(r) ? c - r : null,
            // Why an item was not compared, readable without another paid run.
            candidateError: candidate[index].error,
            referenceError: reference[index].error,
        };
    });
    const deltas = perItem
        .map((item) => item.delta)
        .filter((delta) => delta !== null);
    const candidateFields = fieldsOf(candidate);
    const referenceFields = fieldsOf(reference);
    const extraFields = candidateFields.filter(
        (field) => !referenceFields.includes(field),
    );
    const missingFields = referenceFields.filter(
        (field) => !candidateFields.includes(field),
    );
    const medianDelta = median(deltas);

    const flags = [];
    if (deltas.length === 0) flags.push("no_comparable_usage");
    else if (deltas.length < CORPUS.length) flags.push("incomplete");
    // Any nonzero delta, so an overhead on a few requests is not hidden by the median.
    if (deltas.some(Boolean)) flags.push("input_delta");

    return {
        review: "human",
        flags,
        comparedItems: deltas.length,
        medianDelta,
        // The spread shows what a median hides: an overhead on only some requests.
        deltaRange: deltas.length
            ? [Math.min(...deltas), Math.max(...deltas)]
            : null,
        usageFields: {
            candidate: candidateFields,
            reference: referenceFields,
            extra: extraFields,
            missing: missingFields,
        },
        errors: {
            candidate: candidate.filter((item) => item.error).length,
            reference: reference.filter((item) => item.error).length,
        },
        perItem,
    };
}

export function parsePairs(text) {
    return (text ?? "")
        .split(",")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
            const [candidate, reference, extra] = pair
                .split("=")
                .map((name) => name.trim());
            if (!candidate || !reference || extra !== undefined)
                throw new Error(
                    `Bad pair "${pair}", expected candidate=reference`,
                );
            return { candidate, reference };
        });
}

/** Probes each model once, even when it appears in several pairs, and fills `results` as pairs finish. */
export async function runUsageProbe({ pairs, seed, api, results = [] }) {
    const probes = new Map();
    const probe = (model) => {
        if (!probes.has(model))
            probes.set(model, probeModel({ model, seed, api }));
        return probes.get(model);
    };
    for (const { candidate, reference } of pairs) {
        results.push({
            candidate,
            reference,
            ...compareUsage(await probe(candidate), await probe(reference)),
        });
    }
    return results;
}

const signed = (value) => (value > 0 ? `+${value}` : `${value}`);

export function formatResult(result) {
    const head = `${result.flags.length ? "REVIEW" : "ok"}  ${result.candidate} vs ${result.reference}`;
    const errors = `errors: candidate ${result.errors.candidate}, reference ${result.errors.reference}`;
    if (result.comparedItems === 0)
        return `${head}: no comparable usage (${errors})`;
    const [low, high] = result.deltaRange;
    const delta = `prompt-token delta median ${signed(result.medianDelta)}, range ${signed(low)}..${signed(high)} over ${result.comparedItems} items`;
    return result.comparedItems < CORPUS.length
        ? `${head}: ${delta} (${errors})`
        : `${head}: ${delta}`;
}

async function main(argv = process.argv.slice(2)) {
    const { values: opts } = parseArgs({
        args: argv,
        options: {
            pairs: { type: "string" },
            seed: { type: "string" },
            timeout: { type: "string", default: "120" },
            out: { type: "string", default: join(HERE, "data") },
            "dry-run": { type: "boolean", default: false },
            help: { type: "boolean", default: false },
        },
    });
    if (opts.help) return console.log(USAGE);
    const pairs = parsePairs(opts.pairs);
    if (pairs.length === 0) throw new Error(`Give --pairs.\n\n${USAGE}`);
    const seed = Number(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    console.log(
        `Seed ${seed}: corpus v${CORPUS_VERSION} (${CORPUS.length} items) x ${pairs.length} pair(s)`,
    );
    if (opts["dry-run"]) {
        for (const text of CORPUS)
            console.log(`  ${chars(text)} chars  ${JSON.stringify(text)}`);
        return console.log(
            `Pairs: ${pairs.map((p) => `${p.candidate}=${p.reference}`).join(", ")}`,
        );
    }
    const key = process.env.POLLINATIONS_API_KEY;
    if (!key) throw new Error("Set POLLINATIONS_API_KEY.");

    const startedAt = new Date();
    const results = [];
    // Our own 401/402/403 stops the run; the pairs that finished are still saved.
    let stopped;
    try {
        await runUsageProbe({
            pairs,
            seed,
            api: {
                baseUrl: defaultBaseUrl(),
                key,
                timeoutMs: Number(opts.timeout) * 1000,
            },
            results,
        });
    } catch (error) {
        stopped = error.message;
    }
    const report = {
        version: 1,
        corpusVersion: CORPUS_VERSION,
        date: startedAt.toISOString(),
        seed,
        corpus: CORPUS,
        results,
        stopped,
    };
    const dir = join(opts.out, "usage-probes");
    mkdirSync(dir, { recursive: true });
    const file = join(
        dir,
        `${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    for (const result of results) console.log(formatResult(result));
    console.log(`Saved ${file}`);
    if (stopped) throw new Error(stopped);
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
