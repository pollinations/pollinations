import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
    agentEvidence,
    azureLifecycle,
    azureRates,
    coverageFor,
    findingsFor,
    openRouterRates,
    pinnedEndpoint,
    standardEndpoint,
    validateAssessment,
} from "./analyze.mjs";
import {
    CATALOGS,
    catalogFacts,
    catalogHeaders,
    matchCatalogModel,
    sameOrigin,
} from "./catalogs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const ARM = "https://management.azure.com";
const API = "https://gen.pollinations.ai";
const MODEL = "community/pollinations-ai/model-pricing-researcher";
const { values } = parseArgs({
    options: {
        models: { type: "string" },
        out: { type: "string", default: join(ROOT, "temp/pricing-research") },
        replay: { type: "string" },
        assess: { type: "boolean", default: false },
        help: { type: "boolean" },
    },
});
if (values.help) {
    console.log(
        "node operations/model-pricing/run.mjs [--models canonical,ids] [--out directory] [--replay snapshot.json] [--assess]\nDefaults to every registry route and modality, including fallbacks. Provider coverage is explicit; missing collectors remain gaps. Uses existing environment credentials. Writes local evidence/CSV/issue previews; never publishes or changes models.",
    );
    process.exit(0);
}
const out = resolve(values.out);
await mkdir(out, { recursive: true });
const write = (name, data) =>
    writeFile(
        join(out, name),
        typeof data === "string" ? data : JSON.stringify(data, null, 2),
        { mode: 0o600 },
    );

async function inventory() {
    const { build } = await import("esbuild");
    const path = join(out, "inventory.cjs");
    await build({
        absWorkingDir: ROOT,
        entryPoints: [join(HERE, "inventory.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node22",
        tsconfig: join(ROOT, "gen.pollinations.ai/tsconfig.json"),
        outfile: path,
        logLevel: "silent",
    });
    const compiled = createRequire(import.meta.url)(path);
    const all = compiled.inventory;
    if (!values.models) return all;
    const names = values.models.split(",");
    for (const name of names)
        if (!all.some((m) => m.name === name))
            throw new Error(`Unknown registry model: ${name}`);
    const selected = new Set(
        names.flatMap((name) => [
            name,
            ...all.find((m) => m.name === name).fallbacks,
        ]),
    );
    return all.filter((m) => selected.has(m.name));
}

async function collect(selected, replay) {
    const at = replay?.at ?? new Date().toISOString(),
        sources = [],
        cache = new Map();
    const subscription =
            replay?.azureSubscription ?? process.env.AZURE_SUBSCRIPTION_ID,
        token = process.env.AZURE_ACCESS_TOKEN;
    const get = (url) => {
        if (!cache.has(url))
            cache.set(
                url,
                (async () => {
                    const source = { url, at, status: "complete" };
                    sources.push(source);
                    try {
                        if (replay) {
                            const saved = replay.sources.find(
                                (s) => s.url === url,
                            );
                            if (!saved)
                                throw new Error("Replay source unavailable");
                            Object.assign(source, saved);
                            return saved.status === "complete"
                                ? saved.data
                                : null;
                        }
                        if (url === CATALOGS.vast.url) {
                            source.data = {
                                text: await readFile(
                                    join(
                                        ROOT,
                                        "operations/infrastructure/gpu/GPU_INSTANCES.md",
                                    ),
                                    "utf8",
                                ),
                            };
                            return source.data;
                        }
                        const awsCommand = {
                            "https://bedrock.us-east-1.amazonaws.com/foundation-models":
                                "list-foundation-models",
                            "https://bedrock.us-east-1.amazonaws.com/inference-profiles":
                                "list-inference-profiles",
                        }[url];
                        if (awsCommand) {
                            const { stdout } = await promisify(execFile)(
                                "aws",
                                [
                                    "bedrock",
                                    awsCommand,
                                    "--region",
                                    "us-east-1",
                                    "--output",
                                    "json",
                                ],
                                { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
                            );
                            source.data = JSON.parse(stdout);
                            return source.data;
                        }
                        const response = await fetch(url, {
                            headers: sameOrigin(url, ARM)
                                ? { Authorization: `Bearer ${token}` }
                                : catalogHeaders(url),
                            signal: AbortSignal.timeout(30_000),
                            redirect: "error",
                        });
                        if (!response.ok) {
                            const body = await response
                                .json()
                                .catch(() => null);
                            const missingModelsRead =
                                new URL(url).hostname === "api.elevenlabs.io" &&
                                body?.detail?.status ===
                                    "missing_permissions" &&
                                body.detail.message?.includes("models_read");
                            throw new Error(
                                `HTTP ${response.status}${missingModelsRead ? "; models_read permission missing" : ""}`,
                            );
                        }
                        const document = Object.values(CATALOGS).some(
                            (c) => c.document && c.url === url,
                        );
                        source.data = document
                            ? { text: await response.text() }
                            : await response.json();
                        return source.data;
                    } catch (error) {
                        source.status = "unavailable";
                        source.error = /^HTTP \d+/.test(error.message)
                            ? error.message
                            : "Request timed out or response was invalid";
                        return null;
                    }
                })(),
            );
        return cache.get(url);
    };
    const list = (data, key, url) => {
        const items = key ? data?.[key] : data;
        if (Array.isArray(items)) return items;
        const source = sources.find((s) => s.url === url);
        if (source?.status === "complete") {
            source.status = "incomplete";
            source.error = `Expected ${key} array missing`;
        }
        return null;
    };
    const pages = async (url, key, nextKey) => {
        const items = [],
            origin = new URL(url).origin;
        for (let page = 0; url && page < 10; page++) {
            const data = await get(url);
            const pageItems = list(data, key, url);
            if (!pageItems) return null;
            const source = sources.find((s) => s.url === url);
            items.push(...pageItems);
            url = data[nextKey];
            if (url && (page === 9 || !sameOrigin(url, origin))) {
                source.status = "incomplete";
                source.error =
                    "Pagination limit or unexpected next-page origin";
                return null;
            }
        }
        return url ? null : items;
    };
    const catalogUrl =
        "https://openrouter.ai/api/v1/models?output_modalities=all";
    const catalog = list(await get(catalogUrl), "data", catalogUrl);
    const accounts =
        subscription && (token || replay)
            ? await pages(
                  `${ARM}/subscriptions/${encodeURIComponent(subscription)}/providers/Microsoft.CognitiveServices/accounts?api-version=2024-10-01`,
                  "value",
                  "nextLink",
              )
            : null;
    const providerScans = [],
        catalogs = new Map();
    const otherProviders = [...new Set(selected.map((m) => m.provider))].filter(
        (p) => !["azure", "openrouter"].includes(p),
    );
    const scanProvider = async (provider) => {
        const config = CATALOGS[provider];
        const scan = {
            provider,
            status: "unavailable",
            evidence: [],
            models: 0,
            error: null,
        };
        providerScans.push(scan);
        if (!config) {
            scan.error = "No collector for this registry provider";
            return;
        }
        let url = config.url;
        const items = [],
            seen = new Set(),
            deadline = Date.now() + 90_000;
        while (url && seen.size < 10 && Date.now() < deadline) {
            if (seen.has(url) || !sameOrigin(url, config.url)) break;
            seen.add(url);
            scan.evidence.push(url);
            const data = await get(url);
            if (!data) {
                scan.error = sources.find((s) => s.url === url)?.error;
                break;
            }
            if (config.document) {
                scan.status =
                    provider === "vast"
                        ? "fleet_inventory_only"
                        : "document_only";
                return;
            }
            const page = list(data, config.items, url);
            if (!page) {
                scan.error = "Invalid catalog schema";
                break;
            }
            items.push(...page);
            if (config.next) url = data[config.next];
            else if (config.cursor && data[config.cursor]) {
                const next = new URL(config.url);
                next.searchParams.set(
                    config.cursorParam ?? "cursor",
                    data[config.cursor],
                );
                url = next.href;
            } else if (data.has_more) {
                scan.error =
                    "Provider reports more pages without supported pagination";
                break;
            } else url = null;
        }
        scan.models = items.length;
        scan.status = url
            ? items.length
                ? "partial"
                : "unavailable"
            : "catalog_fetched";
        if (url && !scan.error)
            scan.error =
                "Catalog pagination incomplete or provider time budget exceeded";
        catalogs.set(provider, items);
    };
    for (let i = 0; i < otherProviders.length; i += 4)
        await Promise.all(otherProviders.slice(i, i + 4).map(scanProvider));
    const profilesUrl =
        "https://bedrock.us-east-1.amazonaws.com/inference-profiles";
    const profiles = otherProviders.includes("aws")
        ? list(await get(profilesUrl), "inferenceProfileSummaries", profilesUrl)
        : [];
    for (const provider of ["azure", "openrouter"].filter((p) =>
        selected.some((m) => m.provider === p),
    )) {
        const evidence = sources.filter((s) =>
            provider === "azure"
                ? sameOrigin(s.url, ARM)
                : s.url === catalogUrl,
        );
        providerScans.push({
            provider,
            status: (provider === "azure" ? accounts : catalog)
                ? "catalog_fetched"
                : "unavailable",
            evidence: evidence.map((s) => s.url),
            models: provider === "azure" ? null : (catalog?.length ?? 0),
            error:
                provider === "azure" && !accounts
                    ? "Azure account inventory unavailable"
                    : null,
        });
    }
    const observations = [];
    const inspect = async (m) => {
        const row = {
            name: m.name,
            provider: m.provider,
            category: m.category,
            hidden: m.hidden,
            route: m.route,
            fallbackOnly: m.fallbackOnly,
            fallbacks: m.fallbacks,
            configuredCost: m.cost,
            configuredRetirement: m.retirementDate,
            publicPricing: m.publicPricing,
            observedRates: {},
            exactPrice: false,
            priceBasis: null,
            lifecycle: "unknown",
            retirementDate: null,
            availability: "unverified",
            cashCost: "unknown",
            creditEligibility: "unknown",
            evidence: [],
            gaps: [],
            alternatives: [],
            catalogMatch: false,
        };
        observations.push(row);
        row.gaps.push(
            "Account credits/discounts and inference capability have not been verified",
            "Only base text input/output/cache-read rates are audited; other billing units remain unverified",
            "Advertised prices may be promotional; promotion end dates remain unverified",
        );
        if (m.costVariants && Object.keys(m.costVariants).length)
            row.gaps.push(
                "Cost variants need a separate workload-specific comparison; this report compares base text rates only",
            );
        if (!["azure", "openrouter"].includes(m.provider)) {
            const scan = providerScans.find((s) => s.provider === m.provider);
            row.evidence.push(...(scan?.evidence ?? []));
            row.providerScan = scan?.status ?? "unavailable";
            if (scan?.error) row.gaps.push(scan.error);
            if (scan?.status === "document_only")
                row.gaps.push(
                    "Official provider document fetched; model-specific price/lifecycle extraction remains unverified",
                );
            if (scan?.status === "fleet_inventory_only")
                row.gaps.push(
                    "Self-hosted GPU fleet inventory read; per-model hardware allocation, utilization and unit costs still need Economics evidence",
                );
            if (!m.route?.model) {
                row.gaps.push(
                    "Exact upstream route is not exported by this modality's inventory adapter; catalog cannot verify this model yet",
                );
                return;
            }
            let upstream = m.route.model;
            if (m.provider === "aws") {
                if (m.route.region !== "us-east-1") {
                    row.gaps.push(
                        "AWS catalog scan currently covers us-east-1 only; this route's region remains unverified",
                    );
                    return;
                }
                row.evidence.push(profilesUrl);
                const profile = profiles?.find(
                    (p) => p.inferenceProfileId === upstream,
                );
                const modelIds = [
                    ...new Set(
                        (profile?.models ?? [])
                            .map(
                                (p) =>
                                    p.modelArn?.split(
                                        "/foundation-model/",
                                    )[1] ??
                                    p.modelArn?.split(":foundation-model/")[1],
                            )
                            .filter(Boolean),
                    ),
                ];
                if (modelIds.length === 1) upstream = modelIds[0];
            }
            const entry = matchCatalogModel(
                m.provider,
                catalogs.get(m.provider) ?? [],
                upstream,
            );
            if (!entry) {
                row.gaps.push(
                    "Exact configured model not matched in fetched catalog; absence does not establish retirement or loss of account access",
                );
                return;
            }
            const facts = catalogFacts(m.provider, entry);
            row.gaps.push(...facts.gaps);
            Object.assign(row, {
                ...facts,
                gaps: row.gaps,
                catalogMatch: true,
                advertisedPricing: entry.pricing ?? null,
            });
            row.exactPrice =
                m.category === "text" &&
                Object.keys(row.observedRates).length > 0;
            row.availability =
                "Exact configured model listed; account inference access untested";
            return;
        }
        if (!m.route) {
            row.gaps.push(
                "Exact upstream route is not exported by this modality's inventory adapter; price and lifecycle remain unverified",
            );
            return;
        }
        const publicId = m.route.model ?? m.name;
        const orModel = catalog?.find((x) => x.id === publicId);
        let endpoints;
        if (orModel) {
            const url = `https://openrouter.ai/api/v1/models/${publicId.split("/").map(encodeURIComponent).join("/")}/endpoints`;
            const response = await get(url);
            row.evidence.push(url, catalogUrl);
            endpoints = list(response?.data, "endpoints", url);
            row.alternatives = (endpoints ?? [])
                .filter(standardEndpoint)
                .map((e) => ({
                    provider: "openrouter",
                    tag: e.tag,
                    model: e.model_id,
                    rates: openRouterRates(e.pricing),
                    advertisedDiscount: e.pricing?.discount ?? null,
                    conditionalPricing: !!e.pricing?.overrides?.length,
                    basis: "Advertised base text rates (public discounts already included) plus 5.5% fee; conditional pricing, capability, credits and account access unverified",
                }));
        }
        if (m.provider === "openrouter") {
            row.evidence.push(catalogUrl);
            row.catalogMatch = !!orModel;
            row.retirementDate = orModel?.expiration_date ?? null;
            const options = m.route.providerOptions;
            const pin =
                options?.only?.length === 1 && options.allow_fallbacks === false
                    ? options.only[0]
                    : null;
            const endpoint = pinnedEndpoint(endpoints ?? [], options, publicId);
            if (endpoint) {
                row.observedRates = openRouterRates(endpoint.pricing);
                row.exactPrice = Object.values(row.observedRates).some(
                    (v) => v !== null,
                );
                row.advertisedPricing = endpoint.pricing;
                row.priceBasis =
                    "Pinned OpenRouter endpoint base rates (public discounts already included) plus 5.5% credit-purchase fee";
                row.availability = "Exact endpoint listed; inference untested";
                if (endpoint.pricing?.overrides?.length)
                    row.gaps.push(
                        "Provider has conditional/time-based prices; only default-condition base rates are compared",
                    );
                if (!row.exactPrice)
                    row.gaps.push("Pinned endpoint has no valid text rates");
            } else
                row.gaps.push(
                    pin
                        ? "Pinned endpoint absent, ambiguous or unavailable in fetched catalog"
                        : "Unpinned provider routing: headline/minimum prices cannot verify this route's cost",
                );
            if (!row.retirementDate)
                row.gaps.push(
                    "OpenRouter supplied no retirement date; lifecycle remains unknown",
                );
            else
                row.gaps.push(
                    "OpenRouter expiration means this catalog model may be removed after that date; other providers may continue serving it",
                );
            return;
        }
        const account = accounts?.find((a) => a.name === m.route.account);
        if (!account) {
            row.gaps.push(
                "Azure account inventory unavailable or configured account not found",
            );
            return;
        }
        const deploymentsUrl = `${ARM}${account.id}/deployments?api-version=2024-10-01`;
        const deployments = await pages(deploymentsUrl, "value", "nextLink");
        const deployment = deployments?.find(
            (d) => d.name === m.route.deployment,
        );
        row.evidence.push(deploymentsUrl);
        if (!deployment) {
            row.gaps.push(
                "Configured Azure deployment not found in complete inventory, or inventory unavailable",
            );
            return;
        }
        row.catalogMatch = true;
        const deployed = deployment.properties?.model;
        row.route = {
            ...m.route,
            region: account.location,
            model: deployed?.name,
            version: deployed?.version,
            sku: deployment.sku?.name,
        };
        row.availability = `Deployment ${deployment.properties?.provisioningState ?? "state unknown"}; inference untested`;
        const modelsUrl = `${ARM}/subscriptions/${encodeURIComponent(subscription)}/providers/Microsoft.CognitiveServices/locations/${encodeURIComponent(account.location)}/models?api-version=2024-10-01`;
        const models = await pages(modelsUrl, "value", "nextLink");
        const lifecycleModel = models?.find(
            (x) =>
                x.model?.name === deployed?.name &&
                x.model?.version === deployed?.version &&
                x.model?.format === deployed?.format,
        )?.model;
        const lifecycle = azureLifecycle(lifecycleModel, deployment.sku?.name);
        row.lifecycle = lifecycle.status;
        row.retirementDate = lifecycle.retirementDate;
        row.evidence.push(modelsUrl);
        if (!lifecycleModel || !lifecycle.skuFound)
            row.gaps.push(
                "Exact Azure model/version/deployment-type lifecycle entry missing",
            );
        if (!row.retirementDate)
            row.gaps.push(
                "No applicable Azure inference retirement date supplied",
            );
        if (!deployed?.name?.startsWith("gpt-")) {
            row.gaps.push(
                "Azure non-GPT retail meter mapping is outside this pilot",
            );
            return;
        }
        const rawStem = deployed.name.slice(4).replaceAll("'", "''");
        const stem = deployed.name
            .slice(4)
            .replaceAll("-", " ")
            .replaceAll("'", "''");
        const filter = `contains(productName, 'OpenAI') and (contains(meterName, '${stem}') or contains(meterName, '${rawStem}')) and armRegionName eq '${account.location}'`;
        const retailUrl = `https://prices.azure.com/api/retail/prices?${new URLSearchParams({ "api-version": "2023-01-01-preview", "$filter": filter })}`;
        const items = await pages(retailUrl, "Items", "NextPageLink");
        row.evidence.push(retailUrl);
        if (!items) {
            row.gaps.push("Azure retail pricing scan incomplete");
            return;
        }
        const prices = azureRates(
            items,
            deployed.name,
            deployment.sku.name,
            account.location,
            at,
        );
        row.observedRates = prices.rates;
        row.meters = prices.meters;
        row.gaps.push(...prices.gaps);
        row.exactPrice = Object.values(prices.rates).some((v) => v !== null);
        row.priceBasis =
            "Azure USD retail base meters for the deployed model/region/SKU; account terms unverified";
    };
    for (let i = 0; i < selected.length; i += 4)
        await Promise.all(
            selected.slice(i, i + 4).map((m) =>
                inspect(m).catch(() => {
                    const row = observations.find((r) => r.name === m.name);
                    row.gaps.push(
                        "Provider response schema mismatch; route assessment incomplete",
                    );
                    row.exactPrice = false;
                    row.observedRates = {};
                    row.retirementDate = null;
                    row.lifecycle = "unknown";
                }),
            ),
        );
    return {
        at,
        azureSubscription: subscription,
        revision:
            replay?.revision ??
            execFileSync("git", ["rev-parse", "HEAD"], {
                cwd: ROOT,
                encoding: "utf8",
            }).trim(),
        inventory: selected,
        observations: observations.sort((a, b) => a.name.localeCompare(b.name)),
        sources,
        providerScans: providerScans.sort((a, b) =>
            a.provider.localeCompare(b.provider),
        ),
    };
}

const replay = values.replay
    ? JSON.parse(await readFile(resolve(values.replay), "utf8"))
    : null;
const snapshot = await collect(
    replay?.inventory ?? (await inventory()),
    replay,
);
await write("snapshot.json", snapshot);
const report = {
    at: snapshot.at,
    revision: snapshot.revision,
    scope: "All selected registry routes remain visible, including modalities and fallbacks without collectors. Source-backed price comparisons currently cover selected text base rates only; other costs, account credits and inference remain unverified.",
    observations: snapshot.observations,
    findings: findingsFor(snapshot.observations, snapshot.at),
    coverage: coverageFor(
        snapshot.inventory,
        snapshot.observations,
        snapshot.providerScans,
    ),
    gaps: [...new Set(snapshot.observations.flatMap((r) => r.gaps))],
    sources: snapshot.sources.map(({ url, at, status, error }) => ({
        url,
        at,
        status,
        error,
    })),
};
await write("coverage.json", report.coverage);
const input = agentEvidence(report);
await write("agent-input.json", input);
if (values.assess) {
    try {
        const key = process.env.POLLINATIONS_API_KEY;
        if (!key)
            throw new Error(
                "POLLINATIONS_API_KEY required for the private agent assessment",
            );
        const auth = { Authorization: `Bearer ${key}` };
        const profile = await fetch(`${API}/account/profile`, {
            headers: auth,
            signal: AbortSignal.timeout(20_000),
        });
        if (
            !profile.ok ||
            (await profile.json()).email !== "pollinationsagent@gmail.com"
        )
            throw new Error("Selected agent account could not be verified");
        const models = await fetch(`${API}/models?reliability=all`, {
            headers: auth,
            signal: AbortSignal.timeout(20_000),
        });
        if (!models.ok) throw new Error("Private model catalog unavailable");
        const model = (await models.json()).find((m) => m.name === MODEL);
        const payload = JSON.stringify(input),
            prices = model?.pricing;
        const prompt = Math.max(
            ...[
                "promptTextTokens",
                "promptCachedTokens",
                "promptCacheWriteTokens",
            ].map((k) => Number(prices?.[k] ?? 0)),
        );
        const completion = Math.max(
            ...["completionTextTokens", "completionReasoningTokens"].map((k) =>
                Number(prices?.[k] ?? 0),
            ),
        );
        const cap =
            (Buffer.byteLength(payload) + 32768) * prompt + 512 * completion;
        if (
            !model?.agent ||
            !model.base_model ||
            prices?.currency !== "pollen" ||
            !Number.isFinite(cap) ||
            cap > 0.1 ||
            !prompt ||
            !completion ||
            model.pricing_adjustments?.length
        )
            throw new Error(
                "Private agent or conservative 0.1 Pollen assessment bound could not be verified",
            );
        const response = await fetch(`${API}/v1/responses`, {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                input: payload,
                max_output_tokens: 512,
                reasoning: { effort: "none" },
                store: false,
                stream: false,
            }),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error(`Assessment HTTP ${response.status}`);
        const data = await response.json();
        const text = (data.output ?? [])
            .flatMap((x) => x.content ?? [])
            .filter((x) => x.type === "output_text")
            .map((x) => x.text)
            .join("\n");
        if (data.status !== "completed" || !data.usage)
            throw new Error("Assessment missing completed provider usage");
        const ids = validateAssessment(text, report.findings);
        report.assessment = {
            model: MODEL,
            baseModel: model.base_model,
            status: "complete",
            prioritizedFindingIds: ids,
            usage: data.usage,
            maximumPollen: cap,
            inputSha256: createHash("sha256").update(payload).digest("hex"),
        };
    } catch (error) {
        report.assessment = {
            status: "failed",
            error: error.message.slice(0, 300),
        };
        process.exitCode = 2;
    }
}
await write("report.json", report);
const quote = (x) => `"${String(x ?? "unknown").replaceAll('"', '""')}"`;
const fields = [
    "model",
    "provider",
    "route",
    "configured_input_per_M",
    "observed_input_per_M",
    "configured_output_per_M",
    "observed_output_per_M",
    "configured_cache_read_per_M",
    "observed_cache_read_per_M",
    "price_basis",
    "retirement",
    "availability",
    "gaps",
];
const csv = [
    fields,
    ...report.observations
        .filter((r) => r.category === "text")
        .map((r) => [
            r.name,
            r.provider,
            JSON.stringify(r.route),
            r.configuredCost.promptTextTokens == null
                ? null
                : r.configuredCost.promptTextTokens * 1e6,
            r.observedRates.promptTextTokens == null
                ? null
                : r.observedRates.promptTextTokens * 1e6,
            r.configuredCost.completionTextTokens == null
                ? null
                : r.configuredCost.completionTextTokens * 1e6,
            r.observedRates.completionTextTokens == null
                ? null
                : r.observedRates.completionTextTokens * 1e6,
            r.configuredCost.promptCachedTokens == null
                ? null
                : r.configuredCost.promptCachedTokens * 1e6,
            r.observedRates.promptCachedTokens == null
                ? null
                : r.observedRates.promptCachedTokens * 1e6,
            r.priceBasis,
            r.retirementDate,
            r.availability,
            r.gaps.join("; "),
        ]),
]
    .map((r) => r.map(quote).join(","))
    .join("\n");
await write("prices.csv", csv);
await write(
    "providers.csv",
    [
        [
            "provider",
            "routes",
            "categories",
            "fallback_routes",
            "routes_with_price_comparisons",
            "routes_with_catalog_matches",
            "provider_scan",
            "scan_error",
        ],
        ...report.coverage.providers.map((p) => [
            p.provider,
            p.routes,
            p.categories.join("; "),
            p.fallbackRoutes,
            p.routesWithPriceComparisons,
            p.routesWithCatalogMatches,
            p.scan.status,
            p.scan.error,
        ]),
    ]
        .map((r) => r.map(quote).join(","))
        .join("\n"),
);
const selected = report.assessment?.prioritizedFindingIds ?? [];
await write(
    "issue-previews.json",
    report.findings.map((f) => ({
        title: `${f.kind}: ${f.model}`,
        findingId: f.id,
        priority: selected.indexOf(f.id) + 1 || null,
        source: f.kind === "price_review" ? "pricing" : "lifecycle",
        facts: f.facts,
        evidence: f.evidence,
        limits: f.limits,
    })),
);
console.log(
    JSON.stringify(
        {
            out,
            observations: report.observations.length,
            findings: report.findings.length,
            coverageGaps: report.gaps.length,
            assessment: report.assessment ?? "not_requested",
        },
        null,
        2,
    ),
);
