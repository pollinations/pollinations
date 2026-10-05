import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { COMPUTER_TOOL_CALL_PRICE } from "../../shared/registry/mcp.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "../../shared/registry/model-info.ts";
import {
    getModels,
    getRegistryModelDefinition,
} from "../../shared/registry/registry.ts";
import { ASSESSMENT_MODEL, ASSESSMENT_PROMPT } from "./agent.ts";
import {
    analyze,
    dayKey,
    historySnapshot,
    reportDigest,
    reportHtml,
    textAssessmentCost,
} from "./analyze.mjs";
import {
    fal,
    huggingFace,
    openRouter,
    replicate,
    request,
    rows,
} from "./collectors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCOUNT = "pollinationsagent@gmail.com";
const BASE = "https://gen.pollinations.ai";

const { values } = parseArgs({
    options: {
        out: { type: "string", default: join(HERE, "data") },
        secrets: { type: "string" },
        assess: { type: "boolean", default: false },
        model: {
            type: "string",
            default: "community/pollinations-ai/model-manager-agent",
        },
        help: { type: "boolean", default: false },
    },
});

if (values.help) {
    console.log(
        `Report-only model manager. Options: [--out /absolute/path] [--secrets /absolute/encrypted.json] [--assess] [--model public-id]\n\nPublic collection needs no Pollinations key. --assess reads POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER from the environment or supplied SOPS file, verifies the agent account, and makes one bounded inference call only when there are new leads. Provider read-only access uses existing REPLICATE_API_TOKEN from the same sources. Cloud launchers inject only the required runtime environment variables into the VM. No keys are created or changed.\nExit 2 means a report was saved with incomplete source coverage.`,
    );
    process.exit(0);
}

function credential(name: string): string | undefined {
    if (process.env[name]) return process.env[name];
    if (!values.secrets) return undefined;
    try {
        return execFileSync(
            "sops",
            ["--decrypt", "--extract", `["${name}"]`, resolve(values.secrets)],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ).trim();
    } catch {
        return undefined;
    }
}

async function save(path: string, data: string) {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, data, { mode: 0o600 });
    await rename(temporary, path);
}

async function assessment(report: {
    at: string;
    revision: string;
    liveCatalog: ModelInfo[];
    findings: ReturnType<typeof analyze>;
    gaps: unknown[];
}) {
    if (!report.findings.some((finding) => finding.newFinding))
        return { status: "not_needed", reason: "No new leads to assess" };
    const token = credential("POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER");
    if (!token)
        return {
            status: "blocked_access",
            reason: "POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER required from runtime environment or SOPS",
        };
    try {
        const profile = JSON.parse(
            (
                await request(`${BASE}/account/profile`, {
                    Authorization: `Bearer ${token}`,
                })
            ).text,
        );
        if (profile.email !== ACCOUNT)
            return {
                status: "blocked_access",
                reason: "Credential does not belong to the selected agent account",
            };
        const model = report.liveCatalog.find(
            (m) =>
                m.name === ASSESSMENT_MODEL ||
                m.aliases?.includes(ASSESSMENT_MODEL),
        );
        const hosted = report.liveCatalog.find(
            (m) => m.name === values.model || m.aliases?.includes(values.model),
        );
        if (!hosted?.agent)
            return {
                status: "blocked_access",
                reason: "Private model-manager agent is not available to this key",
            };
        const evidence = JSON.stringify({
            at: report.at,
            revision: report.revision,
            findings: report.findings.filter((f) => f.newFinding).slice(0, 5),
            gaps: report.gaps,
        });
        if (Buffer.byteLength(evidence) > 12000)
            return {
                status: "blocked_budget",
                reason: "Research evidence exceeds the hosted agent's 12000-byte limit",
            };
        const maximumCost = textAssessmentCost(
            model,
            Buffer.byteLength(ASSESSMENT_PROMPT + evidence),
        );
        if (maximumCost === null)
            return {
                status: "blocked_budget",
                reason: "Selected assessment model lacks a bounded plain-text rate sheet",
            };
        if (maximumCost + COMPUTER_TOOL_CALL_PRICE > 0.1)
            return {
                status: "blocked_budget",
                reason: "Inference upper bound exceeds the prototype's 0.1 Pollen assessment cap",
            };
        const response = await fetch(`${BASE}/v1/responses`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: values.model,
                input: evidence,
                max_output_tokens: 1200,
                store: false,
                stream: false,
            }),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok)
            return {
                status: "failed",
                reason: `Inference returned HTTP ${response.status}`,
            };
        const body = await response.json();
        const text = (body.output ?? [])
            .flatMap((item) => item.content ?? [])
            .filter((part) => part.type === "output_text")
            .map((part) => part.text)
            .join("\n");
        if (!body.usage || !text || body.status !== "completed")
            return {
                status: "failed",
                reason: "Assessment missing content or provider usage",
            };
        return {
            status: "complete",
            model: values.model,
            baseModel: ASSESSMENT_MODEL,
            text,
            usage: body.usage,
            estimatedUpperBoundPollen: maximumCost + COMPUTER_TOOL_CALL_PRICE,
            responseId: body.id,
            chargedPrice: response.headers.get("x-usage-price"),
        };
    } catch {
        return {
            status: "failed",
            reason: "Account verification or inference request failed; no automatic retry",
        };
    }
}

async function main() {
    const out = resolve(values.out);
    await mkdir(out, { recursive: true, mode: 0o700 });
    const history = [];
    for (const name of (await readdir(out))
        .filter((name) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort()
        .slice(-14))
        history.push(JSON.parse(await readFile(join(out, name), "utf8")));
    const at = new Date().toISOString();
    // Same-day retries replace the snapshot, never count as another daily trend observation.
    const previousDays = history.filter((day) => dayKey(day.at) !== dayKey(at));
    let notified = {};
    try {
        notified = JSON.parse(
            await readFile(join(out, "notified.json"), "utf8"),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const registry = getModels().map((name) => {
        const model = getRegistryModelDefinition(name);
        return {
            name,
            aliases: model.aliases,
            provider: model.provider,
            cost: model.cost,
            costVariants: model.costVariants,
            priceMultiplier: model.priceMultiplier,
            retirementDate: model.retirementDate,
            hidden: model.hidden,
            fallbackOnly: model.fallbackOnly,
            public: modelInfoFromDefinition(name, model),
        };
    });
    const categories = [...new Set(registry.map((m) => m.public.category))];
    const sources = [];
    const [hf, or, fa, re] = await Promise.allSettled([
        huggingFace(categories, previousDays.at(-1)?.at),
        openRouter(),
        fal(),
        replicate(credential("REPLICATE_API_TOKEN"), previousDays),
    ]);
    for (const [index, result] of [hf, or, fa, re].entries()) {
        const source =
            result.status === "fulfilled"
                ? result.value
                : {
                      source: ["huggingface", "openrouter", "fal", "replicate"][
                          index
                      ],
                      status: "unavailable",
                      observations: [],
                      queries: [
                          {
                              status: "unavailable",
                              error: "Collector failed",
                          },
                      ],
                  };
        sources.push(source);
        console.log(
            `${source.source}: ${source.status}, ${source.observations.length} identities`,
        );
    }
    let liveCatalog = [];
    const gaps = sources.flatMap((s) =>
        s.queries
            .filter((q) => q.status !== "complete")
            .map((q) => ({ source: s.source, ...q })),
    );
    try {
        const token = values.assess
            ? credential("POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER")
            : undefined;
        liveCatalog = rows(
            JSON.parse(
                (
                    await request(
                        `${BASE}/models?reliability=all`,
                        token ? { Authorization: `Bearer ${token}` } : {},
                    )
                ).text,
            ),
        );
    } catch {
        gaps.push({
            source: "pollinations",
            status: "unavailable",
            error: "Deployed catalog unavailable",
        });
    }
    const revision =
        process.env.MODEL_MANAGER_REPOSITORY_REVISION ??
        execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: HERE,
            encoding: "utf8",
        }).trim();
    const snapshot = {
        at,
        account: ACCOUNT,
        revision,
        registry,
        liveCatalog,
        sources,
    };
    const priority = [
        "retirement_review",
        "pricing_review",
        "model_review",
        "sourcing_lead",
        "investigate",
        "lifecycle_lead",
    ];
    const findings = analyze(snapshot, previousDays, notified).sort(
        (a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind),
    );
    const report = {
        ...snapshot,
        findings,
        gaps,
        mode: "report_only",
        execution: process.env.MODEL_MANAGER_SANDBOX_ID
            ? `Pollinations VM ${process.env.MODEL_MANAGER_SANDBOX_ID}`
            : "local",
        assessment: values.assess ? null : { status: "not_requested" },
    };
    if (values.assess) report.assessment = await assessment(report);
    if (
        ["failed", "blocked_access", "blocked_budget"].includes(
            report.assessment.status,
        )
    )
        gaps.push({ source: "assessment", ...report.assessment });
    await save(
        join(out, `snapshot-${dayKey(at)}.json`),
        JSON.stringify(historySnapshot(snapshot)),
    );
    await save(join(out, "report.json"), JSON.stringify(report, null, 2));
    await save(join(out, "report.html"), reportHtml(report));
    await save(join(out, "report.md"), reportDigest(report));
    for (const finding of findings.filter((f) => f.newFinding))
        notified[finding.fingerprint] = at;
    await save(join(out, "notified.json"), JSON.stringify(notified));
    console.log(
        `Saved ${findings.length} research findings to ${join(out, "report.html")}`,
    );
    if (gaps.length) process.exitCode = 2;
}

main().catch((error) => {
    console.error(
        `Model manager failed: ${error instanceof Error ? error.message : "Unknown local error"}`,
    );
    process.exitCode = 1;
});
