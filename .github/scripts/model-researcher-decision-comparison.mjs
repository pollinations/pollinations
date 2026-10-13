import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EVIDENCE_CHECKS } from "../../operations/model-management/calibration.mjs";
import {
    buildClaimAudit,
    buildDiscoveryExtraction,
    buildProviderComparison,
    buildResearchControl,
    buildTriage,
    JEV_ENDPOINT,
} from "../../operations/model-management/jev.mjs";
import {
    budgetUsed,
    officialCatalog,
    paidPost,
    reserve,
} from "../../operations/model-management/researcher.mjs";
import { readJsonWithRetries } from "../../operations/model-management/retries.mjs";

const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Labels are fixed by the supplied text, before any inference. They are never sent to models.
const heldOut = [
    [
        "The API page for acme/model-7 includes curl https://api.acme.example/v1/chat/completions with model acme/model-7.",
        "Acme documents a hosted chat API for exact acme/model-7.",
        "supported",
    ],
    [
        "The acme/model-7 page lists downloadable weights and a Python local-loading example only.",
        "Acme documents a hosted chat API for exact acme/model-7.",
        "insufficient",
    ],
    [
        "Acme serves acme/model-7 on demand without reserving a dedicated instance.",
        "Acme offers acme/model-7 through a serverless API.",
        "insufficient",
    ],
    [
        "Acme serves acme/model-7-lite. The full acme/model-7 is not offered.",
        "Acme serves exact acme/model-7.",
        "contradicted",
    ],
    [
        "Acme lists acme/model-7 but gives no API or deployment information.",
        "Acme serves acme/model-7 through a serverless API.",
        "insufficient",
    ],
    [
        "Acme's documentation lists a hosted endpoint for acme/model-7. No test was made with Pollinations' account.",
        "Pollinations has verified working account access to acme/model-7.",
        "insufficient",
    ],
    [
        "acme/model-7 standard text input is USD 0.25 per 1M tokens; cached input is USD 0.025 per 1M tokens.",
        "acme/model-7 standard uncached text input is USD 0.25 per 1M tokens.",
        "supported",
    ],
    [
        "acme/model-7 cached input is USD 0.025 per 1M tokens; ordinary input is USD 0.25 per 1M tokens.",
        "acme/model-7 ordinary input is USD 0.025 per 1M tokens.",
        "contradicted",
    ],
    [
        "acme/model-7 text output costs USD 1 per 1M tokens. No input rate is listed.",
        "acme/model-7 text input costs USD 1 per 1M tokens.",
        "insufficient",
    ],
    [
        "acme/model-7 costs USD 2 per hour for a dedicated instance. Throughput depends on workload.",
        "acme/model-7 costs USD 2 per 1M tokens.",
        "insufficient",
    ],
    [
        "acme/model-7 input costs USD 0.10 per 1M tokens during a promotion for eligible new users only.",
        "All users pay USD 0.10 per 1M input tokens for acme/model-7.",
        "contradicted",
    ],
    [
        "Acme benchmarks exact acme/model-7 at 150 output tokens per second, single request, H100, batch size 1.",
        "Acme reports 150 output tokens per second for acme/model-7 on an H100 at batch size 1.",
        "supported",
    ],
    [
        "Acme reports 150 tokens per second for acme/model-7-lite. The full acme/model-7 is not benchmarked.",
        "Acme reports 150 tokens per second for the full acme/model-7.",
        "insufficient",
    ],
    [
        "Model 7 preview accepted video. The production acme/model-7 accepts text only.",
        "Production acme/model-7 accepts video input.",
        "contradicted",
    ],
    [
        "acme/model-7 accepts text and image input and produces text responses.",
        "acme/model-7 generates images.",
        "insufficient",
    ],
    [
        "acme/model-7 has downloadable Apache-2.0 weights. Acme separately offers an API; no API price is provided.",
        "Acme's hosted acme/model-7 API is free of charge.",
        "insufficient",
    ],
    [
        "Acme has USD 500 credits for eligible new customers. Eligibility of existing Pollinations accounts is not stated.",
        "Pollinations is eligible for Acme's USD 500 credits.",
        "insufficient",
    ],
    [
        "Acme offers model-7 only in West Europe. East US is not supported.",
        "Acme offers model-7 in East US.",
        "contradicted",
    ],
    [
        "Acme plans to retire model-7 on 2030-08-01. The notice says it remains available until then.",
        "Acme has already retired model-7 according to this notice.",
        "contradicted",
    ],
    [
        "Acme retires model-7 and recommends model-8. The notice says model-8 has different input capabilities.",
        "Acme recommends model-8 as a replacement for model-7.",
        "supported",
    ],
    [
        "A forum user says Acme is cheap, without a price, link or named checkpoint.",
        "Acme is the cheapest provider of exact acme/model-7.",
        "insufficient",
    ],
    [
        "Acme's public API lists owner/model-7. It also says account permissions may restrict access.",
        "Acme's public API lists owner/model-7.",
        "supported",
    ],
    [
        "Acme posted 99.9% uptime for September 2029, not October 2029.",
        "Acme posted 99.9% uptime for October 2029.",
        "contradicted",
    ],
    [
        "Acme's model-7 API is available to approved enterprise accounts only.",
        "Any account can use Acme's model-7 API without approval.",
        "contradicted",
    ],
];
const tasks = [];
const add = (category, payload, labels) => {
    assert.deepEqual(
        Object.keys(payload.questions).sort(),
        Object.keys(labels).sort(),
    );
    for (const [id, label] of Object.entries(labels))
        assert.ok(Object.hasOwn(payload.questions[id].criteria, label));
    tasks.push({ category, payload, labels });
};
for (const [category, cases] of [
    ["canary", EVIDENCE_CHECKS],
    ["held-out-evidence", heldOut],
]) {
    for (let i = 0; i < cases.length; i += 2) {
        const items = cases.slice(i, i + 2).map(([excerpt, claim], j) => ({
            id: `${category}-${i + j}`,
            excerpt,
            claim,
        }));
        add(
            category,
            buildClaimAudit(items),
            Object.fromEntries(items.map(({ id }, j) => [id, cases[i + j][2]])),
        );
    }
}
const triage = [
    ["Acme offers owner/model-7 with USD 1 per 1M input tokens.", "relevant"],
    [
        "Only owner/model-7-lite is described; owner/model-7 is not mentioned as a route.",
        "insufficient",
    ],
    ["This page describes painting walls and no AI models.", "irrelevant"],
    [
        "Model 7 is fast; the publisher and exact checkpoint are unspecified.",
        "insufficient",
    ],
    [
        "The API identifier is owner/model-7; the page describes serverless inference.",
        "relevant",
    ],
    [
        "Pricing and availability refer exclusively to other/model-2.",
        "irrelevant",
    ],
];
for (let i = 0; i < triage.length; i += 2)
    add(
        "triage",
        buildTriage(
            ["owner/model-7"],
            triage
                .slice(i, i + 2)
                .map(([text], j) => ({ id: `source-${i + j}`, text })),
        ),
        Object.fromEntries(
            triage
                .slice(i, i + 2)
                .map(([, label], j) => [`source_${j}`, label]),
        ),
    );
const entities = [
    [
        "owner/model-9",
        "owner/model-9 is a text generation model repository.",
        "model",
    ],
    [
        "NicheCloud",
        "NicheCloud offers hosted inference APIs for open models.",
        "provider",
    ],
    [
        "WidgetSDK",
        "WidgetSDK is a local client library, not a hosted inference service or model.",
        "irrelevant",
    ],
    [
        "UnknownThing",
        "UnknownThing was mentioned in a discussion without any description.",
        "ambiguous",
    ],
    [
        "owner/model-10",
        "The model-metadata API record names owner/model-10 as a language model.",
        "model",
    ],
    [
        "Village",
        "Village is a town mentioned in a travel article.",
        "irrelevant",
    ],
];
for (let i = 0; i < entities.length; i += 2) {
    const candidates = entities.slice(i, i + 2).map(([name, quote], j) => ({
        id: `entity-${i + j}`,
        name,
        quote,
        sourceId: `page-${i + j}`,
        url: "https://source.example/models",
    }));
    add(
        "discovery-extraction",
        buildDiscoveryExtraction(candidates, "2026-10-14"),
        Object.fromEntries(
            candidates.map(({ id }, j) => [id, entities[i + j][2]]),
        ),
    );
}
const read = {
    id: "read-pricing",
    kind: "read",
    url: "https://acme.example/pricing",
    sourceId: "pricing-page",
    models: ["owner/model-7"],
    mode: "http",
};
const reason = {
    id: "ask-sol",
    kind: "reason",
    task: "Interpret conflicting pricing terms for this exact model.",
};
const finish = { id: "finish", kind: "finish" };
for (const [stage, actions, evidence, expected] of [
    [
        "crawl",
        [reason, read, finish],
        "The exact provider pricing page is linked and unread. A free HTTP read can resolve the input-price gap before paid reasoning.",
        "read-pricing",
    ],
    [
        "reasoning",
        [reason, finish],
        "All evidence is consistent and complete. Code has extracted prices and compared costs. No reasoning gap remains. Finish without Sol.",
        "finish",
    ],
    [
        "reasoning",
        [finish, reason],
        "Available cheap reads and searches have been exhausted. The named conflicting pricing terms remain unresolved and require semantic reasoning within budget.",
        "ask-sol",
    ],
    [
        "search",
        [
            {
                id: "required-azure",
                kind: "search",
                engine: "exa",
                scope: "azure",
                query: "owner/model-7 Azure API pricing",
                models: ["owner/model-7"],
                required: true,
            },
        ],
        "Azure is required coverage and has not been searched. There is enough budget for the search, despite unknown results.",
        "required-azure",
    ],
])
    add(
        "research-control",
        buildResearchControl({
            stage,
            models: ["owner/model-7"],
            actions,
            evidence,
            remainingPollen: 1,
        }),
        { next_action: expected },
    );
const route = (provider, index, valid = true) => ({
    provider,
    providerWebsite: `https://${provider}.example`,
    upstreamModel: "owner/model-7",
    exactMatch: valid,
    available: valid,
    capabilitiesMatch: true,
    identitySupported: valid,
    availabilitySupported: valid,
    creditEligibility: "unknown",
    runtimeVerified: false,
    cashCost: null,
    verification: valid ? "documented" : "unverified",
    pricing: {
        currency: "USD",
        unit: "1M_tokens",
        input: index ? 0.1 : 2,
        output: index ? 0.2 : 4,
        conditions: [],
    },
    claims: valid
        ? ["identity", "availability", "price"].map((kind) => ({
              kind,
              sourceId: `${provider}-source`,
              quote: `${provider} documents owner/model-7 ${kind}.`,
              quoteHash: createHash("sha256")
                  .update(`${provider} documents owner/model-7 ${kind}.`)
                  .digest("hex"),
          }))
        : [],
    semanticAudit: valid
        ? [
              {
                  id: `owner/model-7:${index}:availability`,
                  relation: "supported",
                  selectedProbability: 0.97,
                  advisory: true,
                  requestDigest: "a".repeat(64),
              },
          ]
        : [],
});
for (const [providers, valid, expected] of [
    [["azure", "other"], [true, true], "route_0"],
    [["bedrock", "fireworks"], [true, true], "route_1"],
    [["azure", "other"], [false, true], "route_1"],
    [["azure", "fireworks"], [false, false], "insufficient"],
]) {
    const id = `comparison-${tasks.length}`;
    add(
        "provider-comparison",
        buildProviderComparison([
            {
                id,
                model: "owner/model-7",
                category: "text",
                routes: providers.map((provider, i) =>
                    route(provider, i, valid[i]),
                ),
            },
        ]),
        { [id]: expected },
    );
}
const expectedPerModel =
    tasks.reduce((sum, task) => sum + Object.keys(task.labels).length, 0) * 2;
assert.equal(expectedPerModel, 112);
const suiteDigest = hash(tasks);
if (process.argv.includes("--check")) {
    assert.ok(
        tasks.every(
            ({ payload }) =>
                Buffer.byteLength(JSON.stringify(payload)) + 4096 <= 30000,
        ),
    );
    console.log(
        JSON.stringify({
            tasks: tasks.length,
            expectedPerModel,
            suiteDigest,
            paidCalls: 0,
        }),
    );
    process.exit(0);
}
assert.ok(process.env.POLLINATIONS_API_KEY && process.env.RESEARCH_OUT);
assert.equal(process.env.GITHUB_RUN_ATTEMPT, "1");
const out = process.env.RESEARCH_OUT;
await mkdir(out, { recursive: true });
const inventory = officialCatalog(
    await readJsonWithRetries(
        "https://gen.pollinations.ai/models?reliability=all",
    ),
);
const candidates = inventory.filter((model) =>
    model.supported_endpoints?.includes(JEV_ENDPOINT),
);
const excluded = candidates.filter((model) =>
    /accepts only noul/i.test(model.description ?? ""),
);
const models = candidates.filter((model) => !excluded.includes(model));
assert.deepEqual(models.map(({ name }) => name).sort(), [
    "jaredpalmer/kev-4b",
    "liquid/d1",
    "openai/gpt-6-luna-decisions",
    "typesafe/jev-1.13",
]);
const report = {
    status: "running",
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 25 * 60000).toISOString(),
    // Keep the first transport probe's reservation inside the same total allowance.
    priorAccountedPollen: 0.00056016702,
    maxPollen: 0.05 - 0.00056016702,
    reservedPollen: 0,
    calls: [],
    results: [],
    suiteDigest,
    expectedPerModel,
    excluded: excluded.map(({ name, description }) => ({ name, description })),
    pricing: models.map(({ name, pricing, context_length }) => ({
        name,
        pricing,
        context_length,
    })),
    scope: "Fixed text-grounded researcher cases, both option orders. Synthetic task comparison, not a general model benchmark or proof of web coverage.",
};
const prior = JSON.parse(
    await readFile(
        join(process.env.COMPARISON_PREVIOUS, "comparison.json"),
        "utf8",
    ),
);
const priorTasks = JSON.parse(
    await readFile(
        join(process.env.COMPARISON_PREVIOUS, "labelled-suite.json"),
        "utf8",
    ),
);
assert.equal(prior.status, "completed");
assert.deepEqual(
    priorTasks.map(({ payload }) => payload),
    tasks.map(({ payload }) => payload),
    "Rescoring must not change any model input",
);
assert.equal(prior.priorAccountedPollen, report.priorAccountedPollen);
report.calls = structuredClone(prior.calls);
report.reservedPollen = prior.reservedPollen;
report.results = prior.results
    .filter(({ order }) => order === 0)
    .map((row) => {
        const expected = tasks[row.task].labels[row.id];
        const call = prior.calls.find(
            (call) =>
                call.task === row.task &&
                call.order === 0 &&
                call.kind === `inference:${row.model}` &&
                call.status === "received",
        );
        assert.ok(call);
        return {
            ...row,
            expected,
            correct: row.valid && row.choice === expected,
            brier: row.valid
                ? Object.entries(
                      call.nativeResponse.answers[row.id].probabilities,
                  ).reduce(
                      (sum, [label, p]) =>
                          sum + (p - Number(label === expected)) ** 2,
                      0,
                  )
                : null,
        };
    });
report.resumedRun = "38474873168";
report.discardedCachedOrderAnswers = prior.results.filter(
    ({ order }) => order === 1,
).length;
report.labelCorrections = [
    {
        id: "held-out-evidence-2",
        from: "supported",
        to: "insufficient",
        reason: "On-demand serving does not explicitly establish an API.",
    },
    {
        id: "held-out-evidence-22",
        from: "insufficient",
        to: "contradicted",
        reason: "The excerpt explicitly negates October.",
    },
];
report.selectionPolicy =
    "Pass deployed known-answer canaries, avoid falsely accepting supported evidence at 0.9, then maximize task accuracy; Brier and cost break ties.";
const save = () =>
    writeFile(
        join(out, "comparison.json"),
        JSON.stringify(
            { ...report, budgetUsedPollen: budgetUsed(report) },
            null,
            2,
        ),
    );
await writeFile(
    join(out, "labelled-suite.json"),
    JSON.stringify(tasks, null, 2),
);
await save();
try {
    for (const order of [1]) {
        for (const model of [...models].sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            const price = Number(model.pricing?.promptTextTokens);
            assert.ok(
                model.pricing?.currency === "pollen" &&
                    price > 0 &&
                    Number.isFinite(price),
            );
            assert.ok(
                Object.entries(model.pricing).every(
                    ([key, value]) =>
                        ["currency", "promptTextTokens"].includes(key) ||
                        Number(value) === 0,
                ),
            );
            for (let index = 0; index < tasks.length; index++) {
                const task = tasks[index];
                const payload = {
                    ...structuredClone(task.payload),
                    model: model.name,
                };
                // A distinct non-evidence state marker prevents the gateway's sorted-JSON cache from replaying order zero.
                payload.state.evaluationAttempt = `${suiteDigest}:${model.name}:${index}:${order}`;
                if (order)
                    for (const q of Object.values(payload.questions))
                        q.criteria = Object.fromEntries(
                            Object.entries(q.criteria).reverse(),
                        );
                // Some providers charge the shared state per question; reserve that worst case.
                const inputUpperBound =
                    (Buffer.byteLength(JSON.stringify(payload)) + 4096) *
                    Object.keys(payload.questions).length;
                let receipt = reserve(
                    report,
                    inputUpperBound * price,
                    `inference:${model.name}`,
                );
                receipt.requestDigest = hash(payload);
                receipt.promptUpperBound = inputUpperBound;
                receipt.task = index;
                receipt.order = order;
                const started = Date.now();
                const response = await paidPost(
                    report,
                    JEV_ENDPOINT,
                    payload,
                    receipt,
                    process.env.POLLINATIONS_API_KEY,
                    save,
                );
                receipt = response.receipt;
                const body = JSON.parse(response.raw);
                receipt.nativeResponse = body;
                const usage = body.usage;
                assert.ok(
                    Number.isSafeInteger(usage?.input_tokens) &&
                        usage.input_tokens > 0 &&
                        usage.input_tokens <= inputUpperBound &&
                        Number.isSafeInteger(usage.output_tokens) &&
                        usage.output_tokens >= 0 &&
                        usage.output_tokens <= 30000,
                    "Missing or unbounded native usage",
                );
                receipt.accountedPollen = usage.input_tokens * price;
                receipt.status = "received";
                for (const prior of report.calls)
                    if (
                        prior !== receipt &&
                        prior.operationId === receipt.operationId &&
                        prior.status === "pending"
                    )
                        prior.status = "uncertain";
                assert.ok(
                    body.model === model.name &&
                        typeof body.id === "string" &&
                        body.id &&
                        body.answers &&
                        hash(Object.keys(body.answers).sort()) ===
                            hash(Object.keys(payload.questions).sort()),
                    "Model or answer mapping mismatch",
                );
                assert.ok(
                    !prior.calls.some(
                        (call) => call.nativeResponse?.id === body.id,
                    ),
                    "Option-order probe was replayed from cache",
                );
                for (const [id, expected] of Object.entries(task.labels)) {
                    const answer = body.answers[id];
                    const probabilities = answer?.probabilities ?? {};
                    const values = Object.values(probabilities);
                    const valid =
                        answer?.type === "choice" &&
                        Object.hasOwn(
                            payload.questions[id].criteria,
                            answer.choice,
                        ) &&
                        hash(Object.keys(probabilities).sort()) ===
                            hash(
                                Object.keys(
                                    payload.questions[id].criteria,
                                ).sort(),
                            ) &&
                        values.every(
                            (p) => Number.isFinite(p) && p >= 0 && p <= 1,
                        ) &&
                        Math.abs(values.reduce((a, b) => a + b, 0) - 1) <=
                            0.001 &&
                        probabilities[answer.choice] >= Math.max(...values) &&
                        Number.isFinite(answer.confidence) &&
                        answer.confidence >= 0 &&
                        answer.confidence <= 1;
                    report.results.push({
                        model: model.name,
                        category: task.category,
                        task: index,
                        id,
                        order,
                        expected,
                        choice: answer?.choice,
                        valid,
                        correct: valid && answer.choice === expected,
                        selectedProbability:
                            probabilities[answer?.choice] ?? null,
                        brier: valid
                            ? Object.entries(probabilities).reduce(
                                  (sum, [label, p]) =>
                                      sum +
                                      (p - Number(label === expected)) ** 2,
                                  0,
                              )
                            : null,
                        latencyMs: Date.now() - started,
                    });
                }
                await save();
            }
            console.log(
                JSON.stringify({
                    model: model.name,
                    order,
                    answers: report.results.filter(
                        (r) => r.model === model.name,
                    ).length,
                    accountedPollen: budgetUsed(report),
                }),
            );
        }
    }
    report.ranking = models
        .map(({ name }) => {
            const rows = report.results.filter((row) => row.model === name);
            const evidence = rows.filter((row) =>
                ["canary", "held-out-evidence"].includes(row.category),
            );
            const latencies = rows
                .map((row) => row.latencyMs)
                .sort((a, b) => a - b);
            const categories = Object.fromEntries(
                [...new Set(rows.map((row) => row.category))].map(
                    (category) => {
                        const part = rows.filter(
                            (row) => row.category === category,
                        );
                        return [
                            category,
                            {
                                correct: part.filter((row) => row.correct)
                                    .length,
                                total: part.length,
                            },
                        ];
                    },
                ),
            );
            assert.equal(rows.length, expectedPerModel);
            return {
                model: name,
                correct: rows.filter((row) => row.correct).length,
                total: rows.length,
                invalid: rows.filter((row) => !row.valid).length,
                canaryErrors: rows.filter(
                    (row) => row.category === "canary" && !row.correct,
                ).length,
                unsafeSupportedEvidence: evidence.filter(
                    (row) =>
                        row.valid &&
                        !row.correct &&
                        row.choice === "supported" &&
                        row.selectedProbability >= 0.9,
                ).length,
                orderDisagreements: rows.filter(
                    (row) =>
                        row.order === 1 &&
                        rows.find(
                            (first) =>
                                first.order === 0 &&
                                first.task === row.task &&
                                first.id === row.id,
                        )?.choice !== row.choice,
                ).length,
                confidentlyWrongEvidence: evidence.filter(
                    (row) =>
                        row.valid &&
                        !row.correct &&
                        row.selectedProbability >= 0.9,
                ).length,
                evidenceCorrect: evidence.filter((row) => row.correct).length,
                acceptedSupported: evidence.filter(
                    (row) =>
                        row.valid &&
                        row.correct &&
                        row.expected === "supported" &&
                        row.selectedProbability >= 0.9,
                ).length,
                meanBrier:
                    rows.reduce((sum, row) => sum + (row.brier ?? 2), 0) /
                    rows.length,
                medianLatencyMs: latencies[Math.floor(latencies.length / 2)],
                pollen: report.calls
                    .filter((call) => call.kind === `inference:${name}`)
                    .reduce(
                        (sum, call) =>
                            sum +
                            (call.status === "received"
                                ? call.accountedPollen
                                : call.reserved),
                        0,
                    ),
                categories,
            };
        })
        .sort(
            (a, b) =>
                a.invalid - b.invalid ||
                a.canaryErrors - b.canaryErrors ||
                a.unsafeSupportedEvidence - b.unsafeSupportedEvidence ||
                b.correct - a.correct ||
                a.meanBrier - b.meanBrier ||
                a.pollen - b.pollen,
        );
    report.status = "completed";
    report.endedAt = new Date().toISOString();
    assert.ok(budgetUsed(report) + report.priorAccountedPollen <= 0.05);
    console.log(
        JSON.stringify({
            ranking: report.ranking,
            budgetUsedPollen: budgetUsed(report),
        }),
    );
} catch (error) {
    report.status = "failed";
    report.failure = error.message.slice(0, 300);
    throw error;
} finally {
    await save();
}
