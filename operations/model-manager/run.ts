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
    pendingFindings,
    reportDigest,
    reportHtml,
    researchEvidence,
    settleAssessment,
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
        "assess-only": { type: "boolean", default: false },
        model: {
            type: "string",
            default: "community/pollinations-ai/model-manager-agent",
        },
        help: { type: "boolean", default: false },
    },
});

if (values.help) {
    console.log(
        `Report-only model manager. Options: [--out /absolute/path] [--secrets /absolute/encrypted.json] [--assess | --assess-only] [--model public-id]\n\nPublic collection needs no Pollinations key. --assess collects and assesses; --assess-only resumes the saved batch without collection. Both read POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER from the environment or supplied SOPS file, verify the agent account, and make one bounded inference call only when leads are pending. Provider read-only access uses existing REPLICATE_API_TOKEN from the same sources. Cloud launchers inject only the required runtime environment variables into the VM. No keys are created or changed.\nExit 2 means a report was saved with incomplete source coverage.`,
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
    assessmentInput: ReturnType<typeof researchEvidence>;
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
        const evidence = JSON.stringify(report.assessmentInput);
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

async function persistReport(out, report, pending, notified) {
    const settled = settleAssessment(pending, report, notified);
    report.pendingCount = settled.pending.length;
    // Save the completed response first; an interrupted local write can be
    // settled again without repeating inference.
    await save(join(out, "report.json"), JSON.stringify(report, null, 2));
    await save(join(out, "pending.json"), JSON.stringify(settled.pending));
    await save(join(out, "notified.json"), JSON.stringify(settled.notified));
    await save(join(out, "report.html"), reportHtml(report));
    await save(join(out, "report.md"), reportDigest(report));
    console.log(
        `Saved ${report.findings.length} research findings; ${report.pendingCount} pending`,
    );
    if (report.gaps.length) process.exitCode = 2;
}

async function assessReport(report) {
    if (["complete", "not_needed"].includes(report.assessment.status)) return;
    report.gaps = report.gaps.filter((gap) => gap.source !== "assessment");
    report.assessment = await assessment(report);
    if (
        ["failed", "blocked_access", "blocked_budget"].includes(
            report.assessment.status,
        )
    )
        report.gaps.push({ source: "assessment", ...report.assessment });
}

async function main() {
    const out = resolve(values.out);
    await mkdir(out, { recursive: true, mode: 0o700 });
    async function readState(name, fallback) {
        try {
            return JSON.parse(await readFile(join(out, name), "utf8"));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            return fallback;
        }
    }
    const notified = await readState("notified.json", {});
    const pending = await readState("pending.json", []);
    if (values["assess-only"]) {
        const report = await readState("report.json", null);
        if (!report?.assessmentInput)
            throw new Error("No saved research batch to assess");
        await assessReport(report);
        await persistReport(out, report, pending, notified);
        return;
    }
    const history = [];
    for (const name of (await readdir(out))
        .filter((name) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort()
        .slice(-14))
        history.push(JSON.parse(await readFile(join(out, name), "utf8")));
    const at = new Date().toISOString();
    // Same-day retries replace the snapshot, never count as another daily trend observation.
    const previousDays = history.filter((day) => dayKey(day.at) !== dayKey(at));
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
        const token = credential("POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER");
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
    const findings = analyze(snapshot, previousDays, notified);
    const waiting = pendingFindings(pending, findings, at);
    const waitingIds = new Set(waiting.map((f) => f.fingerprint));
    const report = {
        ...snapshot,
        findings: [
            ...waiting,
            ...findings.filter((f) => !waitingIds.has(f.fingerprint)),
        ],
        gaps,
        mode: "report_only",
        execution: process.env.MODEL_MANAGER_SANDBOX_ID
            ? `Pollinations VM ${process.env.MODEL_MANAGER_SANDBOX_ID}`
            : "local",
        assessment: { status: "not_requested" },
        assessmentInput: null,
    };
    report.assessmentInput = researchEvidence(report);
    await save(
        join(out, `snapshot-${dayKey(at)}.json`),
        JSON.stringify(historySnapshot(snapshot)),
    );
    await persistReport(out, report, waiting, notified);
    if (values.assess) {
        await assessReport(report);
        await persistReport(out, report, waiting, notified);
    }
}

main().catch((error) => {
    console.error(
        `Model manager failed: ${error instanceof Error ? error.message : "Unknown local error"}`,
    );
    process.exitCode = 1;
});
