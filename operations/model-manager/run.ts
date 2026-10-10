import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import {
    getModels,
    getRegistryModelDefinition,
} from "../../shared/registry/registry.ts";

import {
    analyze,
    assessmentRequest,
    dayKey,
    historySnapshot,
    reportIssue,
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
const MODEL = "community/pollinations-ai/model-manager-agent";
const token = process.env.POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER;

const { values } = parseArgs({
    options: {
        out: { type: "string", default: join(HERE, "data") },
        "assess-only": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
    },
});

if (values.help) {
    console.log(
        "Report-only model manager: [--out /absolute/path] [--assess-only]. The launcher injects runtime credentials; SOPS stays on the host. Collection saves evidence; --assess-only processes that saved batch. Exit 2 means incomplete coverage.",
    );
    process.exit(0);
}

async function save(path: string, data: string) {
    const temporary = `${path}.tmp`;
    await writeFile(temporary, data, { mode: 0o600 });
    await rename(temporary, path);
}

async function assessment(report: {
    findings: ReturnType<typeof analyze>;
    assessmentInput: ReturnType<typeof researchEvidence>;
}) {
    if (!report.findings.some((finding) => finding.newFinding))
        return { status: "not_needed", reason: "No new leads to assess" };
    if (!token)
        return {
            status: "blocked_access",
            reason: "POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER required in the runtime environment",
        };
    try {
        const [profileResponse, catalogResponse] = await Promise.all([
            request(`${BASE}/account/profile`, {
                Authorization: `Bearer ${token}`,
            }),
            request(`${BASE}/models?reliability=all`, {
                Authorization: `Bearer ${token}`,
            }),
        ]);
        const profile = JSON.parse(profileResponse.text);
        const catalog = rows(JSON.parse(catalogResponse.text));
        if (profile.email !== ACCOUNT)
            return {
                status: "blocked_access",
                reason: "Credential does not belong to the selected agent account",
            };
        const hosted = catalog.find((m) => m.name === MODEL);
        if (!hosted?.agent || !hosted.base_model)
            return {
                status: "blocked_access",
                reason: "Private prompt agent is not available to this key",
            };
        const evidence = JSON.stringify(report.assessmentInput);
        if (Buffer.byteLength(evidence) > 12000)
            return {
                status: "blocked_budget",
                reason: "Research evidence exceeds the hosted agent's 12000-byte limit",
            };
        const maximumCost = textAssessmentCost(
            hosted,
            32000 + Buffer.byteLength(evidence),
        );
        if (maximumCost === null)
            return {
                status: "blocked_budget",
                reason: "Selected assessment model lacks a bounded plain-text rate sheet",
            };
        if (maximumCost > 0.1)
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
            body: JSON.stringify(assessmentRequest(evidence, MODEL)),
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
            model: MODEL,
            text,
            usage: body.usage,
            estimatedUpperBoundPollen: maximumCost,
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

async function persistReport(out, report, notified) {
    const settled = settleAssessment(report, notified);
    // Save the completed response first; an interrupted local write can be
    // settled again without repeating inference.
    await save(join(out, "report.json"), JSON.stringify(report, null, 2));
    await save(join(out, "notified.json"), JSON.stringify(settled));
    await save(join(out, "report.md"), reportIssue(report));
    console.log(
        `Saved ${report.findings.length} research findings; ${report.assessmentInput.findings.length} selected`,
    );
    if (report.gaps.length) process.exitCode = 2;
}

async function assessReport(report, out) {
    if (["complete", "not_needed"].includes(report.assessment.status)) return;
    report.gaps = report.gaps.filter((gap) => gap.source !== "assessment");
    report.assessment = await assessment(report);
    // Save paid output before suppression/rendering so an interrupted write can recover.
    await save(join(out, "report.json"), JSON.stringify(report));
    if (!["complete", "not_needed"].includes(report.assessment.status))
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
    const previousReport = await readState("report.json", null);
    const notified = settleAssessment(
        previousReport,
        await readState("notified.json", {}),
    );
    if (values["assess-only"]) {
        const report = previousReport;
        if (!report?.assessmentInput)
            throw new Error("No saved research batch to assess");
        await assessReport(report, out);
        await persistReport(out, report, notified);
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
        replicate(process.env.REPLICATE_API_TOKEN, previousDays),
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
        revision,
        registry,
        liveCatalog,
        sources,
    };
    const findings = analyze(snapshot, previousDays, notified);
    const report = {
        ...snapshot,
        findings,
        gaps,
        mode: "report_only",
        assessment: { status: "not_requested" },
        assessmentInput: null,
    };
    report.assessmentInput = researchEvidence(report);
    await save(
        join(out, `snapshot-${dayKey(at)}.json`),
        JSON.stringify(historySnapshot(snapshot)),
    );
    await persistReport(out, report, notified);
}

main().catch((error) => {
    console.error(
        `Model manager failed: ${error instanceof Error ? error.message : "Unknown local error"}`,
    );
    process.exitCode = 1;
});
