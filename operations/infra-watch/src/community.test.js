import assert from "node:assert/strict";
import { test } from "node:test";
import {
    decision,
    facts,
    filteredModels,
    listingChanges,
    remember,
} from "./community.js";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const HOUR = 3_600_000;
const model = (name, extra) => ({
    name,
    community: true,
    category: "text",
    ...extra,
});
const CATALOG = [
    model("community/o/due", { health: { success_rate: 40 } }),
    model("community/o/later"),
    model("community/o/agent", { agent: true }),
    model("community/o/voice", { category: "audio" }),
    model("community/p/image", { category: "image" }),
    model("community/p/fallback"),
    { name: "openai", category: "text" },
];
const base = {
    catalog: CATALOG,
    rows: [],
    schedule: {},
    results: [],
    told: [],
    listings: null,
    now: NOW,
};

test("candidates are the due community text and image proxies, with their 4h traffic", () => {
    const { candidates } = facts({
        ...base,
        rows: [
            {
                model: "community/o/due",
                is_rollup: 1,
                status_2xx: 3,
                errors_5xx: 9,
                errors_4xx: 2,
            },
            // A route row is not the model's total.
            { model: "community/o/due", is_rollup: 0, status_2xx: 50 },
        ],
        schedule: { "community/o/later": { lastAt: NOW - HOUR, failures: 0 } },
    });
    assert.deepEqual(candidates, [
        {
            model: "community/o/due",
            category: "text",
            health: 40,
            final_2xx: 3,
            final_5xx: 9,
            final_4xx: 2,
        },
        ...["community/p/image", "community/p/fallback"].map((name) => ({
            model: name,
            category: name.includes("image") ? "image" : "text",
            health: null,
            final_2xx: 0,
            final_5xx: 0,
            final_4xx: 0,
        })),
    ]);
});

test("results name a fallback only when public, and only plain-word error codes", () => {
    const { results } = facts({
        ...base,
        results: [
            {
                model: "community/o/due",
                category: "text",
                status: "PROTOCOL",
                protocolError: "stream returned an error event",
                errorCode: "api.private-host.example",
                modelUsed: "community/o/due",
                previous: { status: 200 },
            },
            {
                model: "community/o/later",
                category: "text",
                status: 200,
                errorCode: "BAD_GATEWAY",
                modelUsed: "community/x/hidden",
            },
            {
                model: "community/p/fallback",
                category: "text",
                status: 200,
                modelUsed: "community/o/later",
            },
        ],
    });
    assert.equal(results[0].errorCode, undefined);
    assert.equal(results[0].servedBy, undefined);
    assert.deepEqual(results[0].previous, { status: 200 });
    assert.equal(results[1].errorCode, "BAD_GATEWAY");
    assert.equal(results[1].servedBy, "private");
    assert.equal(results[2].servedBy, "community/o/later");
});

test("fallbacks: listed models with rescues, each fallback's part, private ones unnamed", () => {
    const { fallbacks } = facts({
        ...base,
        rows: [
            {
                model: "community/p/fallback",
                is_rollup: 1,
                status_2xx: 40,
                fallback_rescues: 30,
            },
            {
                model: "community/p/fallback",
                is_rollup: 0,
                fallback_used: true,
                model_used: "community/o/later",
                fallback_rescues: 20,
            },
            {
                model: "community/p/fallback",
                is_rollup: 0,
                fallback_used: true,
                model_used: "community/x/hidden",
                fallback_rescues: 10,
            },
            // Agents are not watched.
            {
                model: "community/o/agent",
                is_rollup: 1,
                status_2xx: 5,
                fallback_rescues: 5,
            },
        ],
    });
    assert.deepEqual(fallbacks, [
        {
            model: "community/p/fallback",
            rescued: 30,
            successes: 40,
            via: [
                { model: "community/o/later", rescued: 20 },
                { model: "private", rescued: 10 },
            ],
        },
    ]);
});

test("the agent's answer is kept within the rails", () => {
    const candidates = [{ model: "community/o/due" }];
    const answer = {
        probe: [
            "community/o/due",
            "community/o/due",
            "community/o/agent",
            "openai",
        ],
        community: { text: "x".repeat(5000), owners: ["o", "p", "everyone"] },
        maintainers: { text: "  " },
        told: ["note", 7, "y".repeat(300)],
    };
    const plan = decision(JSON.stringify(answer), candidates, CATALOG);
    assert.deepEqual(plan.probe, ["community/o/due"]);
    assert.equal(plan.community.text.length, 4096);
    assert.deepEqual(plan.community.owners, ["o", "p"]);
    assert.equal(plan.maintainers, null);
    assert.deepEqual(plan.told, ["note", "y".repeat(200)]);
    // A fenced answer still reads; anything else is no decision.
    assert.deepEqual(
        decision(
            `\`\`\`json\n${JSON.stringify({ probe: [] })}\n\`\`\``,
            [],
            [],
        ),
        { probe: [], community: null, maintainers: null, told: [] },
    );
    assert.equal(decision("not json", [], []), null);
    assert.equal(decision(null, [], []), null);
});

const listed = (name, success_rate) =>
    model(name, {
        health: success_rate == null ? null : { success_rate },
    });

test("filtered: in the full list, not the default one, at 80% or less", () => {
    const all = [
        listed("community/a/hidden", 46),
        listed("community/a/edge", 80),
        listed("community/a/shown", 95),
        listed("community/a/private-soon", 81),
        listed("community/a/unknown", null),
        listed("community/a/agent", 10),
        { name: "openai", health: { success_rate: 10 } },
    ];
    all[5].agent = true;
    const shown = [listed("community/a/shown", 95)];
    assert.deepEqual(
        filteredModels(all, shown).map((m) => m.name),
        ["community/a/hidden", "community/a/edge"],
    );
    // No community rate known: nothing to judge yet.
    assert.equal(filteredModels([listed("community/a/x", null)], []), null);
});

test("listing changes: newly filtered, and back in the default list", () => {
    const before = [
        "community/a/back",
        "community/a/still",
        "community/a/gone",
    ];
    const filtered = [
        listed("community/a/still", 50),
        listed("community/a/new", 20),
    ];
    const shown = [
        listed("community/a/back", 92),
        listed("community/a/other", 99),
    ];
    // community/a/gone left both lists: removed or private, not back.
    assert.deepEqual(listingChanges(before, filtered, shown), {
        filtered: 2,
        newly: [{ model: "community/a/new", health: 20 }],
        back: [{ model: "community/a/back", health: 92 }],
    });
});

test("a post keeps only Pollinations links", () => {
    const text = [
        "See [My Models](https://enter.pollinations.ai/my-models)",
        "and https://gen.pollinations.ai/models,",
        "not [this](https://evil.example/x) or http://pollinations.ai.evil.example/y",
        // Read as Discord reads them, these point at evil.example.
        "nor https://pollinations.ai)@evil.example/z",
        "nor https://pollinations.ai[@evil.example]",
        "nor https://evil.example\\@pollinations.ai/",
    ].join(" ");
    const plan = decision(JSON.stringify({ maintainers: { text } }), [], []);
    assert.equal(
        plan.maintainers.text,
        "See [My Models](https://enter.pollinations.ai/my-models) and https://gen.pollinations.ai/models, not [this]([link removed] or [link removed] nor [link removed] nor [link removed] nor [link removed]",
    );
});

test("only the newest 200 notes are kept", () => {
    let told = [];
    for (let i = 0; i < 5; i++)
        told = remember(
            told,
            Array.from({ length: 50 }, (_, j) => `n${i}-${j}`),
            i,
        );
    assert.equal(told.length, 200);
    assert.deepEqual(told[0], { at: 1, note: "n1-0" });
    assert.deepEqual(told.at(-1), { at: 4, note: "n4-49" });
});
