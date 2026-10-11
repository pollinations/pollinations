import assert from "node:assert/strict";
import test from "node:test";
import {
    assess,
    assessGroup,
    modelContract,
    modelGroups,
    research,
} from "./researcher.mjs";

const models = Array.from({ length: 8 }, (_, index) => ({
    name: `publisher/model-${index}`,
    publisher: "Publisher",
    category: "text",
    community: false,
}));
const scopes = ["azure", "fireworks", "bedrock", "alternatives"];
const plan = {
    action: "plan",
    questions: [
        "Which exact versions exist?",
        "Which providers offer them?",
        "What pricing is documented?",
    ],
    routes: [],
    discoveries: [],
    gaps: [],
};
const report = (selected = models) => ({
    models: selected.map(({ name }) => ({
        name,
        routes: [],
        discoveries: [],
        gaps: [`${name}: availability and prices unknown`],
    })),
    routes: [],
    discoveries: [],
    gaps: [],
});
const coverage = (selected = models) =>
    new Map(
        selected.map(({ name }) => [
            name,
            new Map(
                scopes.map((scope) => [
                    scope,
                    new Set(["web:exa:challenge:exact models"]),
                ]),
            ),
        ]),
    );
const search = (scope, selected = models, extra = {}) => ({
    scope,
    engine: "exa",
    mode: "web",
    purpose: "challenge",
    query: `${scope} ${selected.map(({ name }) => name).join(" ")} availability pricing`,
    models: selected.map(({ name }) => name),
    ...extra,
});
const call = (name, args) => ({ name, args });
const latest = (messages) =>
    JSON.parse(messages.findLast((message) => message.role === "tool").content);

test("a second verified report replaces the first digest and binds submission to its exact gaps", async () => {
    const first = report();
    const second = report();
    second.models[0].gaps = [`${models[0].name}: regional access unknown`];
    let firstDigest;
    let secondDigest;
    const observed = await run([
        [call("research", plan)],
        scopes.map((scope) => call("search", search(scope))),
        [call("research", { action: "verify", ...first })],
        (messages) => {
            assert.equal(latest(messages).status, "audited");
            firstDigest = latest(messages).auditDigest;
            return [call("research", { action: "verify", ...second })];
        },
        (messages) => {
            assert.equal(latest(messages).status, "audited");
            secondDigest = latest(messages).auditDigest;
            assert.notEqual(secondDigest, firstDigest);
            return [
                call("research", {
                    action: "submit",
                    auditDigest: firstDigest,
                }),
            ];
        },
        (messages) => {
            assert.equal(latest(messages).status, "rejected");
            assert.match(
                latest(messages).reason,
                /current verified report digest/,
            );
            return [
                call("research", {
                    action: "submit",
                    auditDigest: secondDigest,
                }),
            ];
        },
    ]);
    assert.ifError(observed.error);
    assert.equal(observed.turns, 6);
    const submitted = observed.result.models.find(
        ({ name }) => name === models[0].name,
    );
    assert.ok(submitted.gaps.includes(second.models[0].gaps[0]));
    assert.equal(submitted.gaps.includes(first.models[0].gaps[0]), false);
});

async function run(
    steps,
    { selected = models, sharedSources = [], task = { models: selected } } = {},
) {
    let turns = 0;
    const searches = [];
    const responses = [];
    const inferenceOptions = [];
    const services = {
        sharedSources,
        infer: async (messages, _tools, options) => {
            inferenceOptions.push(options);
            const step = steps[turns++];
            assert.ok(step, "Unexpected extra inference");
            if (messages.some((message) => message.role === "tool"))
                responses.push(latest(messages));
            const actions = typeof step === "function" ? step(messages) : step;
            return {
                role: "assistant",
                tool_calls: actions.map(({ name, args }, index) => ({
                    id: `${turns}-${index}`,
                    type: "function",
                    function: { name, arguments: JSON.stringify(args) },
                })),
            };
        },
        search: async (query) => {
            searches.push(query);
            return "No verified primary-source evidence; availability remains unknown.";
        },
    };
    try {
        return {
            result: await research(task, services, selected, steps.length),
            turns,
            searches,
            responses,
            inferenceOptions,
        };
    } catch (error) {
        return { error, turns, searches, responses, inferenceOptions };
    }
}

test("single and discovery reports verify then submit the exact audited candidate by digest", async () => {
    for (const discovery of [false, true]) {
        const selected = models.slice(0, 1);
        const candidate = {
            routes: [],
            discoveries: discovery
                ? [
                      {
                          kind: "provider",
                          name: "New provider",
                          reason: "Fetched primary catalog lead; pricing unknown",
                          sourceIds: ["s1"],
                      },
                  ]
                : [],
            gaps: ["Exact routes and pricing remain unknown"],
        };
        const searches = discovery
            ? ["web", "reddit", "huggingface", "replit"].map((mode) =>
                  call("search", {
                      ...search("discovery", selected),
                      mode,
                  }),
              )
            : scopes.map((scope) => call("search", search(scope, selected)));
        const sharedSources = [
            {
                id: "s1",
                status: "fetched",
                method: "scrapling-http",
                url: "https://example.com/catalog",
                text: "New provider catalog fetched with exact primary-source details; pricing remains unknown.",
            },
        ];
        const observed = await run(
            [
                [call("research", plan)],
                [
                    ...searches,
                    call("fetch", { url: sharedSources[0].url, mode: "saved" }),
                ],
                (messages) => {
                    assert.match(
                        JSON.parse(messages.at(-1).content).runtime.instruction,
                        /Verify the compact exact candidate/,
                    );
                    return [
                        call("research", { action: "verify", ...candidate }),
                    ];
                },
                (messages) => {
                    const audit = latest(messages);
                    assert.equal(audit.status, "audited");
                    assert.match(audit.auditDigest, /^[a-f0-9]{64}$/);
                    assert.deepEqual(audit.gaps, candidate.gaps);
                    assert.match(
                        JSON.parse(messages.at(-1).content).runtime.instruction,
                        /Submit action=submit,auditDigest only/,
                    );
                    return [
                        call("research", {
                            action: "submit",
                            auditDigest: audit.auditDigest,
                        }),
                    ];
                },
            ],
            {
                selected,
                sharedSources,
                task: discovery ? {} : { model: selected[0] },
            },
        );
        assert.ifError(observed.error);
        assert.equal(observed.turns, 4);
        assert.deepEqual(observed.result.discoveries, candidate.discoveries);
        assert.deepEqual(observed.result.gaps, candidate.gaps);
        assert.equal(observed.result.recommendation, null);
        assert.equal(observed.inferenceOptions.at(-1).maxTokens, 1000);
        assert.equal(observed.result.actions.at(-1).status, "submitted");
        assert.deepEqual(
            observed.result.sources.map(({ id }) => id),
            ["s1"],
        );
    }
});

test("failed single and discovery audits retain concise action reasons after turn exhaustion", async () => {
    for (const task of [{ model: models[0] }, {}]) {
        const observed = await run(
            [
                [call("research", plan)],
                [call("search", search(task.model ? "azure" : "discovery"))],
                [
                    call("research", {
                        action: "verify",
                        routes: [],
                        discoveries: [],
                        gaps: ["Coverage unknown"],
                    }),
                ],
            ],
            { task },
        );
        assert.match(observed.error.message, /turn budget exhausted/);
        assert.deepEqual(observed.error.evidence.actions.at(-1), {
            turn: 3,
            tool: "research",
            action: "verify",
            status: "rejected",
            reason: task.model
                ? "Required search coverage missing"
                : "Discovery needs four distinct platform modes",
        });
        assert.equal(observed.error.evidence.actions.length, 3);
    }
});

test("preferred non-text routes with unknown prices report a known unit or unknown workload", () => {
    for (const unit of ["image", "unknown"]) {
        const candidate = {
            provider: "azure",
            providerWebsite: "https://azure.com",
            upstreamModel: "image-v1",
            exactMatch: true,
            available: true,
            capabilitiesMatch: null,
            creditEligibility: "unknown",
            pricing: { currency: "USD", unit, input: null, output: null },
            claims: ["identity", "availability"].map((kind) => ({
                kind,
                sourceId: "s1",
                quote: "image-v1 available now",
            })),
        };
        const result = assess(
            { routes: [candidate], discoveries: [], gaps: [] },
            [
                {
                    id: "s1",
                    status: "fetched",
                    url: "https://learn.microsoft.com/catalog",
                    text: "image-v1 available now with image generation capabilities; pricing unknown.",
                },
            ],
            new Map(scopes.map((scope) => [scope, new Set([scope])])),
            { name: "publisher/image-v1", category: "image" },
            [],
        );
        assert.equal(result.recommendation.provider, "azure");
        assert.equal(
            result.recommendation.comparisonWorkload,
            unit === "image" ? "1 image" : "unknown",
        );
        assert.equal(result.routes[0].verification, "unverified");
        assert.equal(result.routes[0].pricing.input, null);
    }
});

test("group inference reserves larger output only for verification and uses a small digest submit", async () => {
    const observed = await run([
        [call("research", plan)],
        scopes.map((scope) => call("search", search(scope))),
        [call("research", plan)],
        [call("research", plan)],
        [call("research", { action: "verify", ...report() })],
        (messages) => [
            call("research", {
                action: "submit",
                auditDigest: latest(messages).auditDigest,
            }),
        ],
    ]);
    assert.ifError(observed.error);
    assert.equal(observed.turns, 6);
    assert.deepEqual(
        observed.inferenceOptions.map(({ maxTokens }) => maxTokens),
        [2000, 2000, 2000, 2000, 6000, 1000],
    );
});

test("batching retains all 221 models exactly once with at most eight per category group", () => {
    const inventory = Array.from({ length: 221 }, (_, index) => ({
        ...models[0],
        name: `publisher/model-${index}`,
        publisher: `Publisher ${index % 3}`,
        category: ["text", "image", "video", "audio"][index % 4],
        health: { successRate: 0.5 },
        capabilities: ["tools"],
    }));
    const groups = modelGroups(inventory);
    assert.ok(groups.length <= 32);
    assert.equal(groups.flat().length, 221);
    assert.deepEqual(
        groups
            .flat()
            .map(({ name }) => name)
            .sort(),
        inventory.map(({ name }) => name).sort(),
    );
    assert.equal(new Set(groups.flat().map(({ name }) => name)).size, 221);
    for (const group of groups) {
        assert.ok(group.length <= 8);
        assert.equal(new Set(group.map(({ category }) => category)).size, 1);
        assert.deepEqual(
            group,
            [...group].sort((a, b) =>
                `${a.publisher}:${a.name}`.localeCompare(
                    `${b.publisher}:${b.name}`,
                ),
            ),
        );
    }
    assert.equal("health" in groups[0][0], false);
    assert.deepEqual(modelContract(inventory[0]).capabilities, ["tools"]);
    assert.deepEqual(inventory[0].health, { successRate: 0.5 });
});

test("group assessment rejects missing, duplicate, foreign and misplaced findings", () => {
    const valid = report();
    assert.equal(
        assessGroup(valid, [], coverage(), models, models).models.length,
        8,
    );
    assert.throws(
        () =>
            assessGroup(
                { ...valid, models: valid.models.slice(1) },
                [],
                coverage(),
                models,
                models,
            ),
        /membership incomplete/,
    );
    assert.throws(
        () =>
            assessGroup(
                {
                    ...valid,
                    models: [...valid.models.slice(1), valid.models[1]],
                },
                [],
                coverage(),
                models,
                models,
            ),
        /Duplicate/,
    );
    assert.throws(
        () =>
            assessGroup(
                {
                    ...valid,
                    models: [
                        { ...valid.models[0], name: "foreign/model" },
                        ...valid.models.slice(1),
                    ],
                },
                [],
                coverage(),
                models,
                models,
            ),
        /Foreign/,
    );
    assert.throws(
        () =>
            assessGroup(
                { ...valid, routes: [{}] },
                [],
                coverage(),
                models,
                models,
            ),
        /belong to their model/,
    );
    assert.throws(
        () =>
            assessGroup(
                {
                    ...valid,
                    models: valid.models.map((row, index) =>
                        index ? row : { ...row, discoveries: [{}] },
                    ),
                },
                [],
                coverage(),
                models,
                models,
            ),
        /market pass/,
    );
});

test("coverage for one model cannot satisfy another model's provider coverage", () => {
    const own = coverage();
    own.set(models[1].name, new Map());
    assert.throws(
        () => assessGroup(report(), [], own, models, models),
        /Required search coverage missing/,
    );
});

test("search rejects unnamed, duplicate and foreign model claims before service invocation", async () => {
    for (const args of [
        search("azure", models.slice(0, 1), { query: "azure generic catalog" }),
        search("azure", models.slice(0, 1), {
            models: [models[0].name, models[0].name],
        }),
        search("azure", models.slice(0, 1), { models: ["foreign/model"] }),
    ]) {
        const observed = await run([
            [call("research", plan)],
            [call("search", args)],
            (messages) => {
                assert.match(
                    latest(messages).reason,
                    /Query must mention|Search must name/,
                );
                return [
                    call("research", {
                        action: "submit",
                        auditDigest: "a".repeat(64),
                    }),
                ];
            },
        ]);
        assert.equal(observed.searches.length, 0);
        assert.match(observed.error.message, /turn budget exhausted/);
    }
});

test("eight models verify and submit by digest in four inference turns with honest unknowns", async () => {
    const sharedSources = [
        {
            id: "s1",
            status: "fetched",
            url: "https://example.com/catalog",
            text: `${models[0].name} version unknown; no documented price.`,
        },
        {
            id: "s2",
            status: "fetched",
            url: "https://example.com/unrelated",
            text: "other/model unrelated saved source",
        },
    ];
    const observed = await run(
        [
            [call("research", plan)],
            scopes.map((scope) => call("search", search(scope))),
            [call("research", { action: "verify", ...report() })],
            (messages) => {
                assert.equal(latest(messages).status, "audited");
                assert.match(latest(messages).auditDigest, /^[a-f0-9]{64}$/);
                return [
                    call("research", {
                        action: "submit",
                        auditDigest: latest(messages).auditDigest,
                    }),
                ];
            },
        ],
        { sharedSources },
    );
    assert.ifError(observed.error);
    assert.equal(observed.turns, 4);
    assert.equal(observed.searches.length, 4);
    assert.equal(observed.result.models.length, 8);
    for (const row of observed.result.models) {
        assert.deepEqual(row.routes, []);
        assert.equal(row.recommendation, null);
        assert.ok(
            row.gaps.some(
                (gap) => gap.includes(row.name) && gap.includes("unknown"),
            ),
        );
    }
    assert.deepEqual(
        observed.result.sources.map(({ id }) => id),
        ["s1"],
    );
    assert.equal(sharedSources.length, 2);
});

test("wrong or invalidated verified digests cannot submit", async () => {
    for (const invalidate of [false, true]) {
        let verifiedDigest;
        const observed = await run([
            [call("research", plan)],
            scopes.map((scope) => call("search", search(scope))),
            [call("research", { action: "verify", ...report() })],
            (messages) => {
                verifiedDigest = latest(messages).auditDigest;
                return invalidate
                    ? [
                          call(
                              "search",
                              search("azure", models, {
                                  query: `${models.map(({ name }) => name).join(" ")} updated azure evidence`,
                              }),
                          ),
                      ]
                    : [
                          call("research", {
                              action: "submit",
                              auditDigest: "0".repeat(64),
                          }),
                      ];
            },
            (messages) => {
                if (!invalidate)
                    assert.match(
                        latest(messages).reason,
                        /current verified report digest/,
                    );
                return [
                    call("research", {
                        action: "submit",
                        auditDigest: verifiedDigest,
                    }),
                ];
            },
            (messages) => {
                assert.match(
                    latest(messages).reason,
                    /current verified report digest/,
                );
                return [call("research", plan)];
            },
        ]);
        if (!invalidate) {
            assert.ifError(observed.error);
            assert.equal(observed.result.models.length, 8);
        } else assert.match(observed.error.message, /turn budget exhausted/);
    }
});

test("each grouped model needs its own challenge and submit occupies its own turn", async () => {
    const missingChallenge = await run([
        [call("research", plan)],
        [
            ...scopes.map((scope) =>
                call("search", search(scope, models, { purpose: "verify" })),
            ),
            call("search", search("azure", models.slice(0, 1))),
        ],
        [call("research", { action: "verify", ...report() })],
        (messages) => {
            assert.match(
                latest(messages).reason,
                /Each grouped model needs a counter-evidence search/,
            );
            return [call("research", plan)];
        },
    ]);
    assert.match(missingChallenge.error.message, /turn budget exhausted/);
    const mixedSubmit = await run([
        [call("research", plan)],
        scopes.map((scope) => call("search", search(scope))),
        [call("research", { action: "verify", ...report() })],
        (messages) => [
            call("research", {
                action: "submit",
                auditDigest: latest(messages).auditDigest,
            }),
            call("research", plan),
        ],
        (messages) => {
            const outputs = messages
                .filter((message) => message.role === "tool")
                .map((message) => JSON.parse(message.content));
            assert.ok(
                outputs.some((output) =>
                    /Submit must be its own tool turn/.test(
                        output.reason ?? "",
                    ),
                ),
            );
            return [call("research", plan)];
        },
    ]);
    assert.match(mixedSubmit.error.message, /turn budget exhausted/);
});

test("digest-only submit rejects repeated report fields", async () => {
    const observed = await run([
        [call("research", plan)],
        scopes.map((scope) => call("search", search(scope))),
        [call("research", { action: "verify", ...report() })],
        (messages) => [
            call("research", {
                action: "submit",
                auditDigest: latest(messages).auditDigest,
                ...report(),
            }),
        ],
        (messages) => {
            assert.equal(latest(messages).status, "rejected");
            assert.match(latest(messages).reason, /digest|only|payload/i);
            return [call("research", plan)];
        },
    ]);
    assert.match(observed.error.message, /turn budget exhausted/);
});

test("a generic alias cannot establish exact model search coverage", async () => {
    const selected = [{ ...models[0], aliases: ["generic"] }];
    const observed = await run(
        [
            [call("research", plan)],
            [
                call(
                    "search",
                    search("azure", selected, {
                        query: "azure generic availability",
                    }),
                ),
            ],
            (messages) => {
                assert.match(
                    latest(messages).reason,
                    /Query must mention each claimed model/,
                );
                return [call("research", plan)];
            },
        ],
        { selected },
    );
    assert.equal(observed.searches.length, 0);
    assert.match(observed.error.message, /turn budget exhausted/);
});
