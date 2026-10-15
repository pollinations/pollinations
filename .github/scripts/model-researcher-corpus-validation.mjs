import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBilledUsage } from "../../operations/model-management/billing.mjs";
import {
    applyCalibration,
    calibratedAudit,
    calibrationState,
} from "../../operations/model-management/calibration.mjs";
import { extractDiscoveries } from "../../operations/model-management/discovery.mjs";
import {
    buildClaimAudit,
    buildResearchControl,
    JEV_ENDPOINT,
    JEV_MODEL,
    jevCost,
    jevQuote,
    validateClaimAudit,
    validateResearchControl,
} from "../../operations/model-management/jev.mjs";
import { officialCandidates } from "../../operations/model-management/prepare.mjs";
import {
    assess,
    assessGroup,
    auditEvidence,
    budgetUsed,
    modelContract,
    modelGroups,
    officialCatalog,
    paidPost,
    reserve,
} from "../../operations/model-management/researcher.mjs";
import { readJsonWithRetries } from "../../operations/model-management/retries.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const key = process.env.POLLINATIONS_API_KEY;
assert.ok(key);
assert.equal(process.env.GITHUB_RUN_ATTEMPT, "1");
const out = process.env.RESEARCH_OUT;
await mkdir(out, { recursive: true });
const prior = JSON.parse(
    await readFile(join(process.env.CORPUS_OUT, "research.json"), "utf8"),
);
const savedInventory = JSON.parse(
    await readFile(
        join(process.env.CORPUS_OUT, "official-catalog.json"),
        "utf8",
    ),
);
const resumedDiscovery = JSON.parse(
    await readFile(join(process.env.DISCOVERY_OUT, "research.json"), "utf8"),
);
assert.equal(resumedDiscovery.status, "complete");
const verified = JSON.parse(
    await readFile(join(process.env.VERIFIED_OUT, "research.json"), "utf8"),
);
assert.equal(
    verified.reason,
    "Real primary InferHub pricing must yield a provider lead",
);
assert.equal(verified.calibration.errors, 0);
assert.equal(verified.calibration.disabled, false);
assert.ok(verified.calls.every((call) => call.status === "received"));
const current = officialCatalog(
    await readJsonWithRetries(
        "https://gen.pollinations.ai/models?reliability=all",
    ),
);
const inventory = savedInventory;
const catalogChanges = {
    added: current
        .filter((row) => !savedInventory.some((old) => old.name === row.name))
        .map(({ name }) => name),
    removed: savedInventory
        .filter((row) => !current.some((live) => live.name === row.name))
        .map(({ name }) => name),
};
const jev = current.find((row) => row.name === JEV_MODEL);
const baseline =
    4.19462079346 +
    budgetUsed(prior) +
    budgetUsed(resumedDiscovery) +
    0.011555206110000004 +
    budgetUsed(verified) +
    0.00029604 +
    0.00281395086 +
    0.00287509866;
const sources = [];
const seen = new Set();
for (const source of [
    ...resumedDiscovery.sources,
    ...prior.sources,
    ...prior.models.flatMap((model) => model.sources ?? []),
]) {
    if (source.status !== "fetched" || seen.has(source.url)) continue;
    let full;
    try {
        full = JSON.parse(
            await readFile(
                join(
                    resumedDiscovery.sources.includes(source)
                        ? process.env.DISCOVERY_OUT
                        : process.env.CORPUS_OUT,
                    "pages",
                    hash(source.url) + ".json",
                ),
                "utf8",
            ),
        );
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    if (full) {
        assert.equal(hash(full.text), full.pageDigest);
        assert.equal(full.requestedUrl, source.url);
    }
    const text = full?.text ?? source.text;
    sources.push({
        ...source,
        ...full,
        id: `corpus-${sources.length}`,
        text,
        digest: hash(text),
        ...(full ? { fullPage: true } : {}),
    });
    seen.add(source.url);
}
const report = {
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 30 * 60000).toISOString(),
    maxPollen: 0.02,
    reservedPollen: 0,
    calls: [],
    replayedDecisions: [],
    calibration: calibrationState(),
    sources,
    models: [],
    catalogChanges,
    baselineAccountedPollen: baseline,
    status: "running",
    validationScope:
        "Saved official evidence and free primary refresh; no new market search or Sol inference",
};
assert.ok(baseline + report.maxPollen < 10);
await writeFile(
    join(out, "official-catalog.json"),
    JSON.stringify(inventory, null, 2),
);
const save = () =>
    writeFile(
        join(out, "research.json"),
        JSON.stringify(
            { ...report, budgetUsedPollen: budgetUsed(report) },
            null,
            2,
        ),
    );
await save();
const decision = async (payload, validate) => {
    let calibration;
    if (validate === validateClaimAudit) {
        calibration = calibratedAudit(payload, report.calibration);
        payload = calibration.payload;
    }
    const quote = jevQuote(jev, payload);
    const cached = verified.calls.find(
        (call) =>
            call.requestDigest === quote.requestDigest &&
            call.status === "received" &&
            call.nativeResponse,
    );
    if (cached) {
        let result = validate(payload, cached.nativeResponse, {
            rejectInvalidChoices: true,
        });
        if (calibration)
            result = applyCalibration(
                report.calibration,
                result,
                cached.nativeResponse,
                calibration.controls,
            );
        report.replayedDecisions.push({
            requestDigest: quote.requestDigest,
            originalRequestId: cached.requestId,
            runId: 38543919267,
        });
        await save();
        return result;
    }
    const billed = await readBilledUsage(key, report.startedAt);
    report.billing = { ...billed, callCount: report.calls.length };
    assert.ok(
        !prior.calls.some(
            (call) =>
                call.status === "pending" &&
                call.requestDigest === quote.requestDigest,
        ),
        "Never retry the old uncertain operation",
    );
    let receipt = reserve(report, quote.reserved, `inference:${JEV_MODEL}`);
    receipt.requestDigest = quote.requestDigest;
    await save();
    const response = await paidPost(
        report,
        JEV_ENDPOINT,
        payload,
        receipt,
        key,
        save,
    );
    receipt = response.receipt;
    const data = JSON.parse(response.raw);
    receipt.nativeResponse = data;
    await save();
    try {
        receipt.observedPollen = jevCost(data.usage, quote);
        let result = validate(payload, data, { rejectInvalidChoices: true });
        if (calibration)
            result = applyCalibration(
                report.calibration,
                result,
                data,
                calibration.controls,
            );
        receipt.accountedPollen = receipt.observedPollen;
        receipt.status = "received";
        for (const prior of report.calls)
            if (
                prior !== receipt &&
                prior.operationId === receipt.operationId &&
                prior.status === "pending"
            )
                prior.status = "uncertain";
        await save();
        console.log(
            JSON.stringify({
                calls: report.calls.length,
                accounted: budgetUsed(report),
                combinedAccounted: baseline + budgetUsed(report),
            }),
        );
        return result;
    } catch (error) {
        receipt.validationError = error.message;
        await save();
        throw error;
    }
};
try {
    const providerParents = new Set([
        "https://inferhub.dev/pricing",
        "https://iframe.ai/pricing/inference",
    ]);
    const providerDocs = new Map();
    const urls = [
        "https://developers.openai.com/api/docs/pricing.md",
        "https://docs.fireworks.ai/serverless/pricing",
        "https://deepinfra.com/Qwen/Qwen3-Embedding-8B",
        "https://deepinfra.com/Qwen/Qwen3-Embedding-8B/api",
        "https://fireworks.ai/models/fireworks/qwen3-embedding-8b",
        ...providerParents,
    ];
    for (const url of urls) {
        const raw = execFileSync(
            "python",
            ["operations/model-management/fetch.py"],
            {
                input: JSON.stringify({
                    url,
                    mode: "http",
                    maxCharacters: 18000,
                }),
                encoding: "utf8",
                env: {
                    PATH: process.env.PATH,
                    FETCH_CACHE_DIR: join(out, "pages"),
                },
            },
        );
        const source = JSON.parse(raw);
        if (
            [...providerDocs.values()].includes(url) &&
            source.status !== "fetched"
        ) {
            report.sources.push({
                ...source,
                id: `refresh-${report.sources.length}`,
                url,
                at: new Date().toISOString(),
            });
            continue;
        }
        assert.equal(source.status, "fetched", url);
        assert.equal(source.extractionVersion, 2);
        const full = JSON.parse(
            await readFile(join(out, "pages", hash(url) + ".json"), "utf8"),
        );
        report.sources.push({
            ...full,
            id: `refresh-${report.sources.length}`,
            status: "fetched",
            method: "scrapling-http",
            at: full.fetchedAt,
            digest: hash(full.text),
        });
        if (providerParents.has(url)) {
            const parent = new URL(url);
            const link = (full.links ?? []).find((item) => {
                const target = new URL(item.url);
                return (
                    (target.hostname === parent.hostname ||
                        target.hostname.endsWith(`.${parent.hostname}`)) &&
                    /\b(?:docs?|documentation|api|integration|reference|quickstart)\b/i.test(
                        `${item.text ?? ""} ${target.pathname}`,
                    )
                );
            });
            assert.ok(
                link,
                `Actual linked API documentation must survive extraction: ${url}`,
            );
            const documentation = new URL(link.url).href;
            providerDocs.set(url, documentation);
            if (!urls.includes(documentation)) urls.push(documentation);
        }
    }
    report.providerDocumentation = [...providerDocs].map(
        ([parentUrl, url]) => ({
            parentUrl,
            url,
            status: report.sources.find((source) => source.url === url)?.status,
        }),
    );
    assert.equal(
        report.providerDocumentation.find(({ parentUrl }) =>
            parentUrl.includes("inferhub.dev"),
        )?.status,
        "fetched",
        "InferHub linked API documentation must be read",
    );
    const model = "qwen/qwen3-embedding-8b";
    const control = buildResearchControl({
        stage: "followup",
        models: [model],
        actions: [
            {
                id: "find-azure",
                kind: "search",
                query: '"qwen3-embedding-8b" Azure managed API official pricing',
                engine: "exa",
                scope: "azure",
                mode: "web",
                models: [model],
            },
            { id: "finish", kind: "finish" },
        ],
        evidence:
            "Saved source-backed Fireworks and DeepInfra embedding prices; Azure access and availability remain unknown. This validation records the plan without executing a search.",
        remainingPollen: 0.05,
    });
    report.control = await decision(control, validateResearchControl);
    const contracts = inventory.map(modelContract);
    const initial = assessGroup(
        officialCandidates(contracts, report.sources),
        report.sources,
        new Map(),
        contracts,
        inventory,
        false,
    );
    report.models = initial.models;
    await save();
    for (const models of modelGroups(contracts)) {
        const names = new Set(models.map(({ name }) => name));
        const first = report.models.filter((row) => names.has(row.name));
        const audited = await auditEvidence(
            { models: first, routes: [], discoveries: [], gaps: [] },
            models,
            report.sources,
            decision,
        );
        const final = assessGroup(
            audited,
            report.sources,
            new Map(),
            models,
            inventory,
            false,
        );
        for (const row of final.models) {
            const native = audited.models.find(
                (item) => item.name === row.name,
            );
            row.routes.forEach((route, index) => {
                route.semanticAudit = native.routes[index].semanticAudit;
            });
            if (native.providerComparison)
                row.providerComparison = native.providerComparison;
            report.models[
                report.models.findIndex((item) => item.name === row.name)
            ] = row;
        }
        await save();
    }
    const rates = new Map(report.models.map((row) => [row.name, row.routes]));
    const extraction = await extractDiscoveries(
        resumedDiscovery.sources,
        inventory,
        decision,
    );
    report.extraction = extraction;
    const discoveryCandidates = extraction.discoveries.map((item) => {
        const sourceIds = item.sourceIds
            .map((id) => {
                const original = resumedDiscovery.sources.find(
                    (source) => source.id === id,
                );
                return report.sources.find(
                    (source) => source.url === original?.url,
                )?.id;
            })
            .filter(Boolean);
        if (item.kind === "provider")
            for (const id of item.sourceIds) {
                const parent = resumedDiscovery.sources.find(
                    (source) => source.id === id,
                );
                const doc = report.sources.find(
                    (source) =>
                        source.url === providerDocs.get(parent?.url) &&
                        source.status === "fetched",
                );
                if (doc && !sourceIds.includes(doc.id)) sourceIds.push(doc.id);
            }
        return { ...item, sourceIds };
    });
    const market = assess(
        { routes: [], discoveries: discoveryCandidates, gaps: [] },
        report.sources,
        new Map(),
        null,
        inventory,
        false,
    );
    report.discovery = await auditEvidence(
        market,
        null,
        report.sources,
        decision,
    );
    const negativeProviderClaims = await decision(
        buildClaimAudit([
            {
                id: "foreign-api",
                claim: "The document advertises inference API access or an API marketplace under the name NewsBrand.",
                excerpt:
                    "NewsBrand is a newsletter. This article links to the unrelated service OmniAPI, whose operator sells hosted inference. OmniAPI owns its API endpoint and charges the user. NewsBrand publishes news only and offers no API or marketplace of its own.",
            },
            {
                id: "sdk-only",
                claim: "The document advertises inference API access or an API marketplace under the name ClientKit.",
                excerpt:
                    "ClientKit is an offline request-formatting library. It cannot run or relay inference and has no hosted endpoint, account balance, inference credits or marketplace. Its documentation mentions API keys solely as inputs that callers must obtain from an unrelated provider.",
            },
        ]),
        validateClaimAudit,
    );
    report.negativeProviderClaims = negativeProviderClaims;
    assert.equal(negativeProviderClaims.grades.length, 2);
    assert.ok(
        negativeProviderClaims.grades.every(
            (grade) => grade.relation !== "supported",
        ),
        "Unrelated API mentions and offline SDKs cannot become provider advertisements",
    );
    assert.ok(
        report.discovery.discoveries.length > 0,
        "Source-grounded discovery leads must survive the actual evidence audit",
    );
    for (const name of ["InferHub", "iframe.ai"]) {
        const accepted = report.discovery.discoveries.find(
            (item) => item.kind === "provider" && item.name === name,
        );
        const pending = report.discovery.pendingProviders.find(
            (item) => item.kind === "provider" && item.name === name,
        );
        assert.ok(
            accepted || pending,
            `${name}: a literal high-confidence lead must remain accepted or explicitly pending`,
        );
        if (pending) {
            assert.equal(pending.status, "needs-source-verification");
            assert.equal(pending.semanticAudit[0].relation, "insufficient");
            assert.ok(pending.extraction.selectedProbability >= 0.9);
        }
        if (name === "InferHub")
            assert.ok(
                (accepted ?? pending).sourceIds.some(
                    (id) =>
                        report.sources.find((source) => source.id === id)
                            ?.url ===
                        providerDocs.get("https://inferhub.dev/pricing"),
                ),
            );
    }
    assert.ok(
        report.discovery.discoveries.every((item) =>
            item.semanticAudit.every(
                (grade) =>
                    grade.relation === "supported" &&
                    grade.selectedProbability >= 0.9 &&
                    grade.calibrationAccepted !== false,
            ),
        ),
    );
    assert.ok(
        report.discovery.discoveries.every(
            (item) =>
                !/^get started\b/i.test(item.name) && item.name !== "ag/99",
        ),
    );
    assert.ok(
        report.models
            .flatMap((row) => row.routes)
            .filter((route) => route.pricing.input !== null).length >= 31,
        "The new audit must retain all fresh priced routes",
    );
    for (const [name, provider, input, output] of [
        ["openai/gpt-5.4-nano", "openai.com", 0.2, 1.25],
        ["openai/gpt-5.4-mini", "openai.com", 0.75, 4.5],
        ["openai/gpt-4o-mini", "openai.com", 0.15, 0.6],
        ["openai/gpt-5-nano", "openai.com", 0.05, 0.4],
        ["moonshotai/kimi-k3", "fireworks", 3, 15],
        ["z-ai/glm-5.3", "fireworks", 1.4, 4.4],
        [model, "deepinfra.com", 0.01, null],
        [model, "fireworks", 0.1, null],
    ]) {
        const route = rates
            .get(name)
            .find(
                (route) =>
                    route.provider === provider &&
                    route.pricing.input === input &&
                    route.pricing.output === output,
            );
        assert.ok(route, `Missing imported real price ${name}/${provider}`);
        assert.ok(
            route.priceEvidence.evidence.every(
                ({ quote, start, end }) =>
                    report.sources
                        .find(
                            (source) =>
                                source.id === route.priceEvidence.sourceId,
                        )
                        .text.slice(start, end) === quote,
            ),
        );
    }
    const comparison = rates.get(model);
    assert.ok(
        comparison.every(
            (route) =>
                route.runtimeVerified === false &&
                route.creditEligibility === "unknown",
        ),
    );
    assert.ok(
        report.models.find((row) => row.name === model).providerComparison,
        "Actual provider comparison must execute",
    );
    report.status = "complete";
} catch (error) {
    report.status = "blocked";
    report.reason = error.message.replaceAll(key, "[redacted]");
    process.exitCode = 1;
}
report.completedAt = new Date().toISOString();
report.billing = {
    ...(await readBilledUsage(key, report.startedAt)),
    callCount: report.calls.length,
};
assert.ok(baseline + budgetUsed(report) < 10);
assert.equal(report.calibration.errors, 0);
assert.equal(report.calibration.disabled, false);
await save();
console.log(
    JSON.stringify({
        status: report.status,
        reason: report.reason,
        models: report.models.length,
        calls: report.calls.length,
        accounted: budgetUsed(report),
        billed: report.billing.pollen,
        combinedAccounted: baseline + budgetUsed(report),
        postedPrices: report.models
            .flatMap((row) => row.routes)
            .filter((route) => route.pricing.input !== null).length,
        acceptedDiscoveryLeads: report.discovery?.discoveries.length,
        acceptedProviders: report.discovery?.discoveries
            .filter(({ kind }) => kind === "provider")
            .map(({ name }) => name),
        pendingProviders: report.discovery?.pendingProviders.map(
            ({ name }) => name,
        ),
        providerDocumentation: report.providerDocumentation,
        replayedDecisions: report.replayedDecisions.length,
    }),
);
