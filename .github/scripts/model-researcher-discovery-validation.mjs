import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBilledUsage } from "../../operations/model-management/billing.mjs";
import { extractDiscoveries } from "../../operations/model-management/discovery.mjs";
import {
    buildResearchControl,
    JEV_ENDPOINT,
    JEV_MODEL,
    jevCost,
    jevQuote,
    validateResearchControl,
} from "../../operations/model-management/jev.mjs";
import { prepareResearch } from "../../operations/model-management/prepare.mjs";
import { inferenceQuote } from "../../operations/model-management/pricing.mjs";
import {
    auditEvidence,
    budgetUsed,
    inferenceCost,
    officialCatalog,
    paidPost,
    publicUrl,
    research,
    researchQuality,
    reserve,
    rpcJson,
    sourceText,
} from "../../operations/model-management/researcher.mjs";
import { readJsonWithRetries } from "../../operations/model-management/retries.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const key = process.env.POLLINATIONS_API_KEY,
    out = process.env.RESEARCH_OUT;
assert.ok(key && out);
assert.equal(process.env.GITHUB_RUN_ATTEMPT, "1");
const inventory = officialCatalog(
    await readJsonWithRetries(
        "https://gen.pollinations.ai/models?reliability=all",
    ),
);
const jev = inventory.find((row) => row.name === JEV_MODEL),
    sol = inventory.find((row) => row.name === "openai/gpt-6.1-sol");
const rates = (
    await readJsonWithRetries("https://gen.pollinations.ai/mcp")
).data.find((row) => row.id === "exa").pricing.rates;
const baseline = 1.98439823882;
const report = {
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 12 * 60000).toISOString(),
    maxPollen: 0.25,
    reservedPollen: 0,
    calls: [],
    sources: [],
    models: [],
    officialCount: inventory.length,
    selectedCount: 0,
    status: "running",
    baselineAccountedPollen: baseline,
    validationScope:
        "Live broad discovery only; official catalog checked first, no issues or model changes",
};
assert.ok(baseline + report.maxPollen <= 2.5);
await mkdir(out, { recursive: true });
await writeFile(
    join(out, "official-catalog.json"),
    JSON.stringify(inventory, null, 2),
);
const save = async () => {
    report.budgetUsedPollen = budgetUsed(report);
    await writeFile(
        join(out, "research.json"),
        JSON.stringify(report, null, 2),
    );
};
const settle = async (receipt) => {
    receipt.status = "received";
    for (const prior of report.calls)
        if (
            prior !== receipt &&
            prior.operationId === receipt.operationId &&
            prior.status === "pending"
        )
            prior.status = "uncertain";
    await save();
};
await save();
const decision = async (payload, validate) => {
    report.billing = {
        ...(await readBilledUsage(key, report.startedAt)),
        callCount: report.calls.length,
    };
    const quote = jevQuote(jev, payload);
    let receipt = reserve(report, quote.reserved, `inference:${JEV_MODEL}`);
    receipt.requestDigest = quote.requestDigest;
    receipt.promptUpperBound = quote.inputUpperBound;
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
    receipt.accountedPollen = jevCost(data.usage, quote);
    receipt.usage = data.usage;
    const result = validate(payload, data, { rejectInvalidChoices: true });
    assert.equal(result.requestDigest, receipt.requestDigest);
    await settle(receipt);
    console.log(
        JSON.stringify({
            calls: report.calls.length,
            accounted: budgetUsed(report),
        }),
    );
    return result;
};
let rpcId = 0;
const mcp = async (name, args, kind) => {
    const price = Number(rates.find((rate) => rate.kind === kind)?.price);
    let receipt = reserve(report, price, name);
    const response = await paidPost(
        report,
        "/mcp/exa",
        {
            jsonrpc: "2.0",
            id: ++rpcId,
            method: "tools/call",
            params: { name, arguments: args },
        },
        receipt,
        key,
        save,
    );
    receipt = response.receipt;
    const data = rpcJson(response.raw);
    assert.ok(
        !data.error &&
            data.result &&
            !data.result.isError &&
            Array.isArray(data.result.content),
    );
    const text = data.result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    assert.equal(typeof text, "string");
    await settle(receipt);
    return text;
};
const read = async (args) => {
    const url = await publicUrl(args.url);
    let source;
    try {
        if (args.mode === "exa") {
            const text = sourceText(
                await mcp(
                    "web_fetch_exa",
                    { urls: [url], maxCharacters: 4000 },
                    "page",
                ),
            );
            assert.ok(text.length > 40);
            source = {
                url,
                text,
                method: "pollinations-exa",
                status: "fetched",
                digest: hash(text),
            };
        } else {
            const raw = execFileSync(
                "python",
                ["operations/model-management/fetch.py"],
                {
                    input: JSON.stringify({
                        url,
                        mode: "http",
                        maxCharacters: args.maxCharacters ?? 3000,
                        includeLinks: true,
                    }),
                    encoding: "utf8",
                    timeout: 90000,
                    maxBuffer: 300000,
                    env: {
                        PATH: process.env.PATH,
                        FETCH_CACHE_DIR: join(out, "pages"),
                    },
                },
            );
            const result = JSON.parse(raw);
            assert.equal(result.status, "fetched", result.error);
            const page = JSON.parse(
                await readFile(join(out, "pages", `${hash(url)}.json`), "utf8"),
            );
            assert.equal(page.pageDigest, hash(page.text));
            source = {
                ...page,
                status: "fetched",
                method: "scrapling-http",
                digest: hash(page.text),
                fullPage: true,
            };
        }
    } catch (error) {
        source = {
            url,
            status: "unavailable",
            reason: error.message.replaceAll(key, "[redacted]").slice(0, 300),
        };
    }
    source.id = `s${report.sources.length + 1}`;
    report.sources.push(source);
    await save();
    return source;
};
const services = {
    sharedSources: report.sources,
    remainingPollen: () => Math.max(0, report.maxPollen - budgetUsed(report)),
    search: (query) =>
        mcp("web_search_exa", { query, numResults: 8 }, "search_request"),
    read,
    control: (state) =>
        decision(buildResearchControl(state), validateResearchControl),
    extract: (sources) => extractDiscoveries(sources, inventory, decision),
    auditClaims: (proposal, models, sources) =>
        auditEvidence(proposal, models, sources, decision),
    infer: async (messages, tools, options) => {
        const maxTokens = options?.maxTokens ?? 1800;
        const upper =
            Buffer.byteLength(JSON.stringify({ messages, tools })) + 4096 + 256;
        const quote = inferenceQuote(sol, upper, maxTokens);
        let receipt = reserve(report, quote.reserved, `inference:${sol.name}`);
        receipt.promptUpperBound = upper;
        const response = await paidPost(
            report,
            "/v1/chat/completions",
            {
                model: sol.name,
                messages,
                tools,
                tool_choice: "required",
                max_tokens: maxTokens,
                reasoning_effort: "medium",
                stream: false,
            },
            receipt,
            key,
            save,
        );
        receipt = response.receipt;
        const data = JSON.parse(response.raw);
        receipt.usage = data.usage;
        receipt.accountedPollen = inferenceCost(data.usage, quote.pricing);
        assert.ok(
            data.usage.prompt_tokens <= upper &&
                data.usage.completion_tokens <= maxTokens &&
                receipt.accountedPollen <= receipt.reserved &&
                data.choices?.[0]?.message,
        );
        await settle(receipt);
        return data.choices[0].message;
    },
};
try {
    const prepared = await prepareResearch({}, services);
    await save();
    const result = await research(
        {
            task: "Resolve only the discovery gaps selected by Jev; training knowledge is unusable as evidence.",
        },
        { ...services, prepared },
        inventory,
        2,
    );
    report.discovery = { ...result, status: "researched" };
    report.quality = researchQuality(report);
    assert.ok(
        report.quality.discoveryCoverage.every(({ searched }) => searched),
    );
    assert.ok(
        report.sources.some(
            (source) =>
                source.status === "fetched" &&
                source.method === "scrapling-http",
        ),
    );
    assert.ok(
        report.calls.every(
            (call) => call.status === "received" || call.status === "uncertain",
        ),
    );
    report.status = "complete";
} catch (error) {
    report.status = "blocked";
    report.reason = error.message.replaceAll(key, "[redacted]").slice(0, 500);
    process.exitCode = 1;
}
report.completedAt = new Date().toISOString();
report.billing = {
    ...(await readBilledUsage(key, report.startedAt)),
    callCount: report.calls.length,
};
assert.ok(
    budgetUsed(report) <= report.maxPollen &&
        baseline + budgetUsed(report) <= 2.5,
);
await save();
console.log(
    JSON.stringify({
        status: report.status,
        reason: report.reason,
        calls: report.calls.length,
        accounted: budgetUsed(report),
        billed: report.billing.pollen,
        quality: report.quality,
        discoveries: report.discovery?.discoveries.map(({ name, kind }) => ({
            name,
            kind,
        })),
    }),
);
