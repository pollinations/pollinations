import { isPublicUrl, publicUrl } from "./public-url.mjs";

export { publicUrl } from "./public-url.mjs";

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { analyze } from "../model-manager/analyze.mjs";
import {
    fal,
    huggingFace,
    openRouter,
    replicate,
    request,
} from "../model-manager/collectors.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const MAX_HANDOFF_BYTES = 64 * 1024;
const KINDS = {
    investigate: "model_review",
    model_review: "model_review",
    price_review: "pricing_review",
    pricing_review: "pricing_review",
    sourcing_lead: "pricing_review",
    lifecycle_lead: "lifecycle_review",
};
const SUMMARIES = {
    model_review:
        "Upstream discovery or revision evidence requires exact route and capability verification.",
    pricing_review:
        "Observed pricing evidence requires verification against the exact configured route, units and account terms.",
    retirement_review:
        "A source declares a retirement date; verify the affected route before migration.",
    retirement_metadata_review:
        "Provider and registry retirement dates differ; verify the official notice.",
    lifecycle_review:
        "A provider lifecycle signal needs deadline and exact route verification.",
};

export function proposalKey(model, version, kind) {
    return createHash("sha256")
        .update(JSON.stringify([model, version ?? null, KINDS[kind] ?? kind]))
        .digest("hex");
}

// Account/route facts stay in private evidence. Credentials never cross this boundary.
export function sanitize(value, env = process.env, depth = 0) {
    if (depth > 8) return "[depth limit]";
    if (typeof value === "string") {
        let text = value;
        for (const [key, secret] of Object.entries(env)) {
            if (
                /(?:key|token|secret|password|credential)/i.test(key) &&
                typeof secret === "string" &&
                secret.length >= 4
            )
                text = text.replaceAll(secret, "[redacted]");
        }
        return text
            .replace(/\b(?:sk|pk|ag)_[a-zA-Z0-9_-]+\b/g, "[redacted]")
            .replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [redacted]")
            .replace(
                /([?&](?:key|api_key|token|access_token|secret)=)[^&#\s]+/gi,
                "$1[redacted]",
            )
            .slice(0, 1000);
    }
    if (Array.isArray(value))
        return value.slice(0, 40).map((v) => sanitize(v, env, depth + 1));
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 60)
                .filter(
                    ([key]) =>
                        !/^(?:authorization|cookie|headers|apiKey|api_key|accessToken|access_token|token|secret|password|privateKey|private_key|credentials)$/i.test(
                            key,
                        ),
                )
                .map(([key, v]) => [key, sanitize(v, env, depth + 1)]),
        );
    return value;
}

function canonicalModel(finding, registry) {
    const id = finding.model ?? finding.id;
    const direct = registry.find(
        (m) => m.name === id || m.aliases?.includes(id),
    );
    if (direct) return direct.name;
    const matches = registry.filter((m) => m.route?.model === id);
    return matches.length === 1 ? matches[0].name : id;
}

export function makeHandoff(report, kind, env = process.env) {
    if (
        !Number.isFinite(Date.parse(report.at)) ||
        !["discovery", "pricing"].includes(kind) ||
        !Array.isArray(report.findings)
    )
        throw new Error("Invalid research snapshot");
    const registry = report.registry ?? report.inventory ?? [];
    const gaps = [...(report.gaps ?? [])];
    for (const source of report.sources ?? []) {
        if (source.queries?.length) {
            gaps.push(
                ...source.queries
                    .filter((q) => q.status !== "complete")
                    .map((q) => ({ source: source.source, ...q })),
            );
        } else if (source.status !== "complete")
            gaps.push({
                source: source.source ?? source.url,
                status: source.status,
                error: source.error,
            });
    }
    if (kind === "pricing")
        gaps.unshift(
            report.scope ??
                "Coverage is limited to supported exact text base rates; other modalities, variants, credits and account terms remain unverified.",
        );
    const handoff = {
        at: report.at,
        revision: sanitize(report.revision, env),
        kind,
        findings: [],
        gaps: gaps.slice(0, 100).map((gap) => sanitize(gap, env)),
    };
    if (gaps.length > 100)
        handoff.gaps.push({
            status: "bounded",
            omittedGaps: gaps.length - 100,
        });
    let omittedGaps = Math.max(0, gaps.length - 100);
    while (
        Buffer.byteLength(JSON.stringify(handoff)) > MAX_HANDOFF_BYTES / 2 &&
        handoff.gaps.length > 1
    ) {
        const bounded = handoff.gaps.find(
            (gap) => gap?.omittedGaps !== undefined,
        );
        const index = handoff.gaps.findLastIndex(
            (gap) => gap?.omittedGaps === undefined,
        );
        handoff.gaps.splice(index, 1);
        omittedGaps++;
        if (bounded) bounded.omittedGaps = omittedGaps;
        else handoff.gaps.push({ status: "bounded", omittedGaps });
    }
    const seen = new Map();
    let omitted = 0;
    for (const finding of report.findings) {
        const model = canonicalModel(finding, registry);
        if (typeof model !== "string" || !model || model.length > 200) {
            omitted++;
            continue;
        }
        const change = KINDS[finding.kind] ?? finding.kind;
        if (!SUMMARIES[change]) {
            omitted++;
            continue;
        }
        const observation =
            report.observations?.find((row) => row.name === model) ??
            report.sources
                ?.find((source) => source.source === finding.source)
                ?.observations?.find(
                    (row) =>
                        row.id === finding.id ||
                        (finding.url && row.url === finding.url),
                );
        const version = finding.version ?? observation?.version ?? null;
        const key = proposalKey(model, version, change);
        const sourceUrls = [
            ...new Set(
                [
                    finding.url,
                    ...(Array.isArray(finding.evidence)
                        ? finding.evidence
                        : []),
                ]
                    .map(publicUrl)
                    .filter(Boolean),
            ),
        ].slice(0, 8);
        const evidence = sanitize(
            {
                finding,
                observation,
                registry: registry.find((row) => row.name === model),
            },
            env,
        );
        const existing = seen.get(key);
        if (existing) {
            existing.evidence.related ??= [];
            if (existing.evidence.related.length < 3)
                existing.evidence.related.push(evidence);
            existing.sourceUrls = [
                ...new Set([...existing.sourceUrls, ...sourceUrls]),
            ].slice(0, 8);
            continue;
        }
        const item = {
            key,
            model: sanitize(model, env),
            title: `${change.replaceAll("_", " ")}: ${sanitize(model, env)}`,
            summary: SUMMARIES[change],
            sourceUrls: sanitize(sourceUrls, env),
            evidence,
        };
        if (
            handoff.findings.length >= 40 ||
            Buffer.byteLength(
                JSON.stringify({
                    ...handoff,
                    findings: [...handoff.findings, item],
                }),
            ) >
                MAX_HANDOFF_BYTES - 1024
        ) {
            omitted++;
            continue;
        }
        handoff.findings.push(item);
        seen.set(key, item);
    }
    if (omitted)
        handoff.gaps.push({ status: "bounded", omittedFindings: omitted });
    // Duplicate enrichment can also reach the bound. Keep omissions explicit.
    while (
        Buffer.byteLength(JSON.stringify(handoff)) > MAX_HANDOFF_BYTES &&
        handoff.findings.length
    ) {
        handoff.findings.pop();
        omitted++;
        const gap = handoff.gaps.find((g) => g?.omittedFindings !== undefined);
        if (gap) gap.omittedFindings = omitted;
        else handoff.gaps.push({ status: "bounded", omittedFindings: omitted });
    }
    if (Buffer.byteLength(JSON.stringify(handoff)) > MAX_HANDOFF_BYTES)
        throw new Error("Research gaps exceed handoff limit");
    return handoff;
}

async function readSnapshot(path) {
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text) > 16 * 1024 * 1024)
        throw new Error("Snapshot exceeds 16 MiB");
    return JSON.parse(text);
}

async function discovery(out, history) {
    const { build } = await import("esbuild");
    const compiledPath = join(out, "inventory.cjs");
    await build({
        absWorkingDir: ROOT,
        entryPoints: [join(ROOT, "operations/model-pricing/inventory.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node22",
        tsconfig: join(ROOT, "gen.pollinations.ai/tsconfig.json"),
        outfile: compiledPath,
        logLevel: "silent",
    });
    const registry = createRequire(import.meta.url)(compiledPath).inventory.map(
        (m) => ({
            ...m,
            public: { category: m.category, pricing: m.publicPricing },
        }),
    );
    const at = new Date().toISOString();
    const categories = [...new Set(registry.map((m) => m.category))];
    const sources = await Promise.all([
        huggingFace(categories, history.at(-1)?.at),
        openRouter(),
        fal(),
        replicate(process.env.REPLICATE_API_TOKEN, history),
    ]);
    let liveCatalog = [];
    const gaps = [];
    try {
        liveCatalog = JSON.parse(
            (
                await request(
                    "https://gen.pollinations.ai/models?reliability=all",
                )
            ).text,
        );
        if (!Array.isArray(liveCatalog))
            throw new Error("Catalog schema mismatch");
    } catch {
        liveCatalog = [];
        gaps.push({
            source: "deployed_catalog",
            status: "unavailable",
            error: "Request failed or catalog schema changed",
        });
    }
    const snapshot = {
        at,
        revision: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: ROOT,
            encoding: "utf8",
        }).trim(),
        registry,
        sources,
        liveCatalog,
        gaps,
    };
    return { ...snapshot, findings: analyze(snapshot, history) };
}

export async function main(args = process.argv.slice(2)) {
    const { values } = parseArgs({
        args,
        options: {
            kind: { type: "string" },
            out: { type: "string" },
            history: { type: "string" },
            replay: { type: "string" },
            "follow-up": { type: "string" },
        },
    });
    if (
        !["discovery", "pricing"].includes(values.kind) ||
        !values.out ||
        !isAbsolute(values.out)
    )
        throw new Error(
            "Require --kind discovery|pricing --out absolute-private-dir",
        );
    const out = resolve(values.out);
    await mkdir(out, { recursive: true, mode: 0o700 });
    let report;
    if (values.kind === "pricing") {
        await promisify(execFile)(
            process.execPath,
            [
                join(ROOT, "operations/model-pricing/run.mjs"),
                "--out",
                out,
                ...(values.replay ? ["--replay", resolve(values.replay)] : []),
            ],
            { cwd: ROOT, timeout: 15 * 60_000, maxBuffer: 1024 * 1024 },
        );
        report = await readSnapshot(join(out, "report.json"));
    } else {
        const history = values.history
            ? await readSnapshot(resolve(values.history))
            : [];
        if (
            !Array.isArray(history) ||
            history.length > 60 ||
            history.some(
                (s) =>
                    !Number.isFinite(Date.parse(s.at)) ||
                    !Array.isArray(s.sources),
            )
        )
            throw new Error(
                "History requires at most 60 timestamped source snapshots",
            );
        report = values.replay
            ? await readSnapshot(resolve(values.replay))
            : await discovery(out, history);
        if (!Array.isArray(report.findings))
            report.findings = analyze(report, history);
        // Preserve full history coverage; the assessment envelope alone is bounded.
        const snapshot = {
            at: report.at,
            revision: sanitize(report.revision),
            sources:
                report.sources?.map((source) => ({
                    source: source.source,
                    status: source.status,
                    queries: source.queries?.map((query) => sanitize(query)),
                    observations: source.observations?.map((observation) =>
                        sanitize(observation),
                    ),
                })) ?? [],
        };
        await writeFile(join(out, "snapshot.json"), JSON.stringify(snapshot), {
            mode: 0o600,
        });
    }
    const handoff = makeHandoff(report, values.kind);
    if (values["follow-up"]) {
        const input = JSON.parse(values["follow-up"]);
        if (
            typeof input.question !== "string" ||
            input.question.length > 2000 ||
            !Array.isArray(input.sourceUrls) ||
            input.sourceUrls.length > 5 ||
            !input.sourceUrls.length ||
            input.sourceUrls.some((url) => !isPublicUrl(url))
        )
            throw new Error(
                "Follow-up requires bounded public provider sources",
            );
        const sources = [];
        for (const url of input.sourceUrls) {
            try {
                const response = await fetch(url, {
                    redirect: "error",
                    signal: AbortSignal.timeout(15000),
                });
                if (
                    !response.ok ||
                    !/json|text|html/.test(
                        response.headers.get("content-type") ?? "",
                    )
                )
                    throw new Error("Source not readable");
                const reader = response.body.getReader();
                let size = 0;
                let text = "";
                while (size < 16000) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.length;
                    text += Buffer.from(value).toString("utf8");
                }
                await reader.cancel();
                sources.push({
                    url,
                    status: "read",
                    untrustedExcerpt: sanitize(text.slice(0, 1200)),
                });
            } catch {
                sources.push({ url, status: "unavailable" });
            }
        }
        handoff.followUp = { question: sanitize(input.question), sources };
        if (Buffer.byteLength(JSON.stringify(handoff)) > MAX_HANDOFF_BYTES)
            throw new Error("Follow-up exceeds handoff limit");
    }
    await writeFile(join(out, "handoff.json"), JSON.stringify(handoff), {
        mode: 0o600,
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    main().catch(() => {
        console.error(
            "Research collection failed; inspect private source evidence.",
        );
        process.exitCode = 1;
    });
}
