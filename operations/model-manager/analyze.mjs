import { createHash } from "node:crypto";
import { HF_TASKS } from "./collectors.mjs";

const DAY = 86400_000;
export const dayKey = (at) =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(at));

// Caller limits belong to the runner; instructions are managed in the agent UI.
export function assessmentRequest(input, model) {
    if (typeof input !== "string" || Buffer.byteLength(input) > 12000)
        throw new Error("Research evidence must be at most 12000 bytes");
    const evidence = JSON.parse(input);
    if (
        !Number.isFinite(Date.parse(evidence.at)) ||
        !Array.isArray(evidence.findings) ||
        evidence.findings.length < 1 ||
        evidence.findings.length > 5 ||
        !Array.isArray(evidence.gaps)
    )
        throw new Error("Evidence requires a timestamp, 1–5 findings and gaps");
    return {
        model,
        input,
        max_output_tokens: 1200,
        reasoning: { effort: "none" },
        store: false,
        stream: false,
    };
}

export async function storeAssessment(base, token, at, text) {
    if (!token) throw new Error("Computer storage requires an authorized key");
    const response = await fetch(`${base}/mcp/computer`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
            Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "bash",
                arguments: {
                    command: `mkdir -p /workspace/model-manager && cat > /workspace/model-manager/assessment-${dayKey(at)}.json`,
                    cwd: "/workspace",
                    stdin: JSON.stringify({ at, mode: "report_only", text }),
                },
            },
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
        throw new Error(`Computer storage HTTP ${response.status}`);
    const body = await response.json();
    if (body.error || !body.result || body.result.isError)
        throw new Error("Computer storage failed");
}

export function pendingFindings(pending, findings, at) {
    const priority = [
        "retirement_review",
        "pricing_review",
        "model_review",
        "sourcing_lead",
        "investigate",
        "lifecycle_lead",
    ];
    return [
        ...new Map(
            [
                ...pending,
                ...findings
                    .filter((f) => f.newFinding)
                    .map((f) => ({ ...f, observedAt: at })),
            ].map((f) => [f.fingerprint, f]),
        ).values(),
    ].sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind));
}

export function researchEvidence(report) {
    const findings = report.findings.filter((f) => f.newFinding).slice(0, 5);
    const categories = new Set(
        findings.flatMap((f) => {
            const own = report.registry.find((m) => m.name === f.id)?.public
                .category;
            const upstream = report.sources
                .find((s) => s.source === f.source)
                ?.observations.find((m) => m.id === f.id);
            return own
                ? [own]
                : Object.entries(HF_TASKS)
                      .filter(
                          ([category, tasks]) =>
                              tasks.includes(f.task) ||
                              tasks.includes(upstream?.task) ||
                              upstream?.outputModalities?.includes(
                                  category === "embedding"
                                      ? "embeddings"
                                      : category,
                              ),
                      )
                      .map(([category]) => category);
        }),
    );
    const inventory = [...categories]
        .flatMap((category) =>
            report.registry
                .filter(
                    (m) =>
                        !m.hidden &&
                        !m.fallbackOnly &&
                        m.public.category === category,
                )
                .slice(0, 6)
                .map((m) => ({
                    id: m.name,
                    category,
                    description: m.public.description?.slice(0, 160),
                    capabilities: m.public.capabilities?.slice(0, 8),
                })),
        )
        .slice(0, 12);
    return {
        at: report.at,
        revision: report.revision,
        findings: findings.map((f) => ({
            ...f,
            description: f.description?.slice(0, 600),
        })),
        inventory,
        inventoryCoverage:
            "Limited checkout inventory for mapped categories; advertised capabilities, not verified equivalence. Unmapped categories have no supplied alternatives.",
        gaps: [...new Set(report.gaps.map((g) => g.source))].map((source) => {
            const gaps = report.gaps.filter((g) => g.source === source);
            return {
                source,
                count: gaps.length,
                examples: gaps
                    .slice(0, 3)
                    .map(({ label, status, error, count }) => ({
                        label,
                        status,
                        error,
                        count,
                    })),
            };
        }),
    };
}

export function settleAssessment(pending, report, notified) {
    if (report.assessment.status !== "complete") return { pending, notified };
    const completed = new Set(
        report.assessmentInput.findings.map((f) => f.fingerprint),
    );
    return {
        pending: pending.filter((f) => !completed.has(f.fingerprint)),
        notified: {
            ...notified,
            ...Object.fromEntries(
                [...completed].map((fingerprint) => [fingerprint, report.at]),
            ),
        },
    };
}

export function textAssessmentCost(model, inputBytes, maxOutput = 1200) {
    if (
        !model ||
        model.pricing?.currency !== "pollen" ||
        model.capabilities?.includes("web_search") ||
        model.pricing_adjustments?.length
    )
        return null;
    const rates = model.pricing;
    const prompt = Math.max(
        Number(rates.promptTextTokens),
        Number(rates.promptCachedTokens ?? 0),
        Number(rates.promptCacheWriteTokens ?? 0),
    );
    const output = Math.max(
        Number(rates.completionTextTokens),
        Number(rates.completionReasoningTokens ?? 0),
    );
    if (![prompt, output].every((rate) => Number.isFinite(rate) && rate >= 0))
        return null;
    return (inputBytes + 1024) * prompt + maxOutput * output;
}

export function runRates(history, current, at) {
    const points = history
        .map((day) => ({
            at: day.at,
            model: day.sources
                .find((s) => s.source === "replicate")
                ?.observations.find((m) => m.id === current.id),
        }))
        .filter((p) => Number.isFinite(p.model?.runs));
    points.push({ at, model: current });
    const rates = [];
    for (let i = 1; i < points.length; i++) {
        const hours =
            (Date.parse(points[i].at) - Date.parse(points[i - 1].at)) /
            3600_000;
        const delta = points[i].model.runs - points[i - 1].model.runs;
        if (hours >= 18 && hours <= 36 && delta >= 0)
            rates.push({ at: points[i].at, rate: (delta * 24) / hours });
    }
    const latest = rates.at(-1);
    if (!latest || latest.at !== at) return { rate: null, growth: null };
    const earlier = rates
        .slice(0, -1)
        .slice(-7)
        .map((p) => p.rate)
        .sort((a, b) => a - b);
    const median =
        earlier.length % 2
            ? earlier[Math.floor(earlier.length / 2)]
            : (earlier[earlier.length / 2 - 1] + earlier[earlier.length / 2]) /
              2;
    return {
        rate: latest.rate,
        growth: earlier.length >= 3 ? latest.rate / Math.max(median, 10) : null,
    };
}

export function trendReasons(source, model, history, at) {
    const previous = history.at(-1);
    const gap = previous ? Date.parse(at) - Date.parse(previous.at) : Infinity;
    const previousModel = previous?.sources
        .find((s) => s.source === source.source)
        ?.observations.find((m) => m.id === model.id);
    const consecutive =
        gap >= 18 * 3600_000 &&
        gap <= 36 * 3600_000 &&
        dayKey(at) !== dayKey(previous.at);
    const reasons = [];
    if (source.source === "huggingface") {
        for (const signal of model.signals.filter(
            (s) => s.kind === "trending",
        )) {
            const immediate = signal.task ? 5 : 10;
            const repeated = signal.task ? 20 : 50;
            const old = previousModel?.signals.find(
                (s) => s.kind === "trending" && s.task === signal.task,
            );
            if (signal.rank <= immediate)
                reasons.push(
                    `HF ${signal.task ?? "global"} rank ${signal.rank}`,
                );
            else if (
                consecutive &&
                signal.rank <= repeated &&
                old?.rank <= repeated
            )
                reasons.push(
                    `HF ${signal.task ?? "global"} trend persisted for two daily observations`,
                );
        }
    }
    if (
        source.source === "openrouter" &&
        consecutive &&
        model.signals.some((s) => s.kind === "weekly" && s.rank <= 20) &&
        previousModel?.signals.some((s) => s.kind === "weekly" && s.rank <= 20)
    )
        reasons.push(
            "OpenRouter weekly top 20 persisted for two daily observations",
        );
    if (source.source === "replicate") {
        const { rate, growth } = runRates(history, model, at);
        if (rate >= 100 && growth >= 2)
            reasons.push(
                `Observed Replicate momentum: ${Math.round(rate)} runs/day, ${growth.toFixed(1)}x baseline`,
            );
        if (
            model.signals.some((s) => s.kind === "collection") &&
            !history.some((day) =>
                day.sources
                    .find((s) => s.source === "replicate")
                    ?.observations.some(
                        (m) =>
                            m.id === model.id &&
                            m.signals.some((s) => s.kind === "collection"),
                    ),
            )
        )
            reasons.push(
                "New curated API collection seed; editorial evidence, not measured trend",
            );
    }
    return reasons;
}

export function comparePublicPricing(registry, live) {
    const differences = [];
    for (const model of registry) {
        const deployed = live.find((m) => m.name === model.name);
        if (!deployed) continue;
        const keys = new Set([
            ...Object.keys(model.public.pricing),
            ...Object.keys(deployed.pricing ?? {}),
        ]);
        const changed = [...keys].filter(
            (key) =>
                key !== "currency" &&
                Number(model.public.pricing[key] ?? 0) !==
                    Number(deployed.pricing?.[key] ?? 0),
        );
        if (changed.length)
            differences.push({
                kind: "pricing_review",
                id: model.name,
                url: "https://gen.pollinations.ai/models?reliability=all",
                reason: `Checkout and deployed public prices differ: ${changed.join(", ")}`,
                verification:
                    "revision_difference_not_confirmed_billing_defect",
                changed,
                checkoutPricing: model.public.pricing,
                deployedPricing: deployed.pricing,
            });
    }
    return differences;
}

// Only these observations feed trend baselines, revision diffs and the watchlist.
export function historySnapshot(snapshot) {
    return {
        at: snapshot.at,
        sources: snapshot.sources.map((source) => ({
            source: source.source,
            status: source.status,
            queries: source.queries?.map(({ label, status }) => ({
                label,
                status,
            })),
            observations: source.observations.map(
                ({ id, version, runs, signals }) => ({
                    id,
                    version,
                    runs,
                    signals,
                }),
            ),
        })),
    };
}

export function analyze(snapshot, history, notified = {}) {
    const findings = [];
    const allCurrent = [
        ...snapshot.registry,
        ...snapshot.liveCatalog.map((publicModel) => ({
            name: publicModel.name,
            aliases: publicModel.aliases,
            public: publicModel,
        })),
    ];
    for (const source of snapshot.sources) {
        // Missing entries in a partial scan are not removals. Compare against
        // the last actual observation of each identity across retained days.
        const previousModels = new Map();
        for (const day of history)
            for (const model of day.sources.find(
                (s) => s.source === source.source,
            )?.observations ?? [])
                previousModels.set(model.id, model);
        for (const model of source.observations) {
            const existing = allCurrent.find(
                (m) => m.name === model.id || m.aliases?.includes(model.id),
            );
            const reasons = trendReasons(source, model, history, snapshot.at);
            const old = previousModels.get(model.id);
            if (
                previousModels.size &&
                !old &&
                model.signals.some((s) =>
                    [
                        "newest",
                        "new_release",
                        "catalog",
                        "new_model_listing",
                    ].includes(s.kind),
                )
            )
                reasons.push(
                    "First observed in retained history; earlier coverage may be incomplete, release and identity unverified",
                );
            const versionChanged =
                old?.version && model.version && old.version !== model.version;
            if (versionChanged)
                reasons.push(
                    "Upstream revision changed; capability/checkpoint review required",
                );
            if (reasons.length && !existing)
                findings.push({
                    kind: "investigate",
                    source: source.source,
                    id: model.id,
                    url: model.url,
                    reasons,
                    version: model.version,
                    task: model.task,
                    description: model.description,
                    verification: "discovery_only_capabilities_not_tested",
                });
            if (existing && versionChanged)
                findings.push({
                    kind: "model_review",
                    source: source.source,
                    id: existing.name,
                    url: model.url,
                    version: model.version,
                    reason: "Matched upstream revision changed; verify configured route and capabilities before updating",
                    verification: "route_mapping_and_capability_tests_required",
                });
            if (model.retirementDate && existing)
                findings.push({
                    kind: "retirement_review",
                    source: source.source,
                    id: existing.name,
                    url: model.url,
                    retirementDate: model.retirementDate,
                    reason: "Matching OpenRouter listing declares expiration; verify exact configured route before migration",
                    verification: "route_mapping_required",
                });
            if (model.lifecycle === "deprecated")
                findings.push({
                    kind: "lifecycle_lead",
                    source: source.source,
                    id: model.id,
                    url: model.url,
                    reason: "Provider marks endpoint deprecated; confirm deadline and catalog route mapping",
                    verification: "deadline_unknown",
                });
            if (source.source === "openrouter" && existing) {
                const cost = snapshot.registry.find(
                    (m) => m.name === existing.name,
                )?.cost;
                const rates = {
                    promptTextTokens: model.pricing?.prompt,
                    completionTextTokens: model.pricing?.completion,
                };
                const cheaper = Object.entries(rates).filter(
                    ([key, rate]) => rate != null && cost?.[key] > Number(rate),
                );
                if (cheaper.length)
                    findings.push({
                        kind: "sourcing_lead",
                        source: source.source,
                        id: existing.name,
                        url: model.url,
                        reason: "OpenRouter headline rate below checkout cost for one or more token units",
                        upstreamRates: rates,
                        verification:
                            "unverified_provider_pin_fees_credits_capabilities_and_workload",
                    });
            }
        }
    }
    findings.push(
        ...comparePublicPricing(snapshot.registry, snapshot.liveCatalog),
    );
    for (const model of snapshot.registry) {
        if (
            model.retirementDate &&
            model.retirementDate - Date.parse(snapshot.at) <= 90 * DAY
        )
            findings.push({
                kind: "retirement_review",
                id: model.name,
                retirementDate: new Date(model.retirementDate).toISOString(),
                url: "https://github.com/pollinations/pollinations/tree/main/shared/registry",
                reason: `Registry retirement within 90 days (provider ${model.provider}); recheck official notice`,
                verification: "registry_notice_not_independently_reverified",
            });
    }
    return findings.map((finding) => {
        const fingerprint = createHash("sha256")
            .update(
                JSON.stringify([
                    finding.kind,
                    finding.source,
                    finding.id,
                    finding.version,
                    finding.retirementDate,
                    finding.upstreamRates,
                    finding.changed,
                    finding.checkoutPricing,
                    finding.deployedPricing,
                ]),
            )
            .digest("hex");
        return {
            ...finding,
            fingerprint,
            newFinding:
                !notified[fingerprint] ||
                Date.parse(snapshot.at) - Date.parse(notified[fingerprint]) >=
                    30 * DAY,
        };
    });
}

const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char],
    );
const safeLink = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? escapeHtml(url.href) : "#";
    } catch {
        return "#";
    }
};

// Public report excludes account metadata, raw responses and logs.
// Dynamic text stays inside escaped HTML blocks so it cannot inject Markdown or HTML.
export function reportIssue(report) {
    const fresh = report.findings.filter((finding) => finding.newFinding);
    const leads = fresh
        .slice(0, 5)
        .map(
            (finding) =>
                `<li><a href="${safeLink(finding.url)}">${escapeHtml(finding.id)}</a> · ${escapeHtml(finding.kind.replaceAll("_", " "))}<p>${escapeHtml(finding.reason ?? finding.reasons?.join("; "))}</p></li>`,
        )
        .join("");
    const coverage = report.sources
        .map(
            (source) =>
                `<li>${escapeHtml(source.source)}: ${escapeHtml(source.status)} · ${source.observations.length} identities</li>`,
        )
        .join("");
    const gaps = report.gaps
        .map(
            (gap) =>
                `<li>${escapeHtml(gap.source)} · ${escapeHtml(gap.label ?? "query")} · ${escapeHtml(gap.status)}</li>`,
        )
        .join("");
    return `## Model manager · report-only\n\n<p>${escapeHtml(report.at)} · New leads: ${fresh.length} · Already recorded: ${report.findings.length - fresh.length} · Coverage gaps: ${report.gaps.length} · Pending after this run: ${report.pendingCount ?? 0}.</p>\n\n### Next investigations (up to five)\n\n<ul>${leads || "<li>No new leads.</li>"}</ul>\n\n### Source coverage\n\n<ul>${coverage}${gaps}</ul>\n\nDiscovery evidence only. Capabilities, exact provider routes, billing correctness and retirement notices still need verification.\n\n### Agent assessment · ${escapeHtml(report.assessment?.status ?? "not_requested")}\n\n<pre>${escapeHtml(report.assessment?.text ?? "No new leads to assess.")}</pre>\n`;
}
