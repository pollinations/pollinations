import assert from "node:assert/strict";
import { test } from "node:test";
import {
    decision,
    fallbackKey,
    filteredModels,
    incidents,
    listingChanges,
    streamKey,
} from "./community.js";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const model = (name, extra) => ({
    name,
    community: true,
    category: "text",
    ...extra,
});
const ERROR = "stream is missing [DONE]";
// A model's last probe, broken, an hour ago; twice: the one before too.
const broke = (extra) => ({
    lastAt: NOW - HOUR,
    status: "PROTOCOL",
    protocolError: ERROR,
    ...extra,
});
const twice = (extra) => broke({ before: broke(), ...extra });
const find = (input) =>
    incidents({
        catalog: [],
        rows: [],
        schedule: {},
        quiet: {},
        listings: null,
        now: NOW,
        ...input,
    });
const brief = (found) => found.map((i) => `${i.kind} ${i.model ?? i.models}`);

test("a broken stream is its owner's at the second in a row on the model's own answers", () => {
    const names = ["a", "b", "c", "d", "e", "f"].map((n) => `community/o/${n}`);
    const found = find({
        catalog: [
            ...names.map((n) => model(n)),
            model("community/o/agent", { agent: true }),
        ],
        schedule: {
            "community/o/a": twice(),
            // Once: the probe before passed.
            "community/o/b": broke({ before: { status: 200 } }),
            // Two different errors.
            "community/o/c": twice({
                protocolError: "stream contained invalid JSON",
            }),
            // The one before was a fallback's answer, not the model's.
            "community/o/d": broke({
                before: broke({ modelUsed: "community/o/f" }),
            }),
            // Now a fallback answered.
            "community/o/e": twice({ modelUsed: "community/o/f" }),
            "community/o/agent": twice(),
            // Not in the catalog.
            "community/o/gone": twice(),
        },
    });
    assert.deepEqual(found, [
        {
            id: "1",
            kind: "stream",
            to: "community",
            model: "community/o/a",
            error: ERROR,
            owners: ["o"],
            quiet: [streamKey("community/o/a", ERROR)],
        },
    ]);
});

test("a told broken stream stays quiet for a day, per model and error", () => {
    const input = {
        catalog: [model("community/o/a")],
        schedule: { "community/o/a": twice() },
    };
    const key = streamKey("community/o/a", ERROR);
    assert.deepEqual(find({ ...input, quiet: { [key]: NOW - DAY + 1 } }), []);
    assert.equal(find({ ...input, quiet: { [key]: NOW - DAY } }).length, 1);
    // Another error told doesn't quiet this one.
    const other = streamKey("community/o/a", "stream contained invalid JSON");
    assert.equal(find({ ...input, quiet: { [other]: NOW } }).length, 1);
});

test("one broken stream on 3 owners' models within 4 hours is the maintainers', and none of the owners'", () => {
    const shared = ["community/a/x", "community/b/y", "community/c/z"];
    const input = {
        catalog: shared.map((n) => model(n)),
        schedule: Object.fromEntries(shared.map((n) => [n, twice()])),
    };
    assert.deepEqual(find(input), [
        {
            id: "1",
            kind: "shared",
            to: "maintainers",
            error: ERROR,
            models: shared,
            owners: [],
            quiet: shared.map((n) => streamKey(n, ERROR)),
        },
    ]);
    // Told: nothing for the maintainers again, still nothing for the owners.
    const quiet = Object.fromEntries(
        shared.map((n) => [streamKey(n, ERROR), NOW]),
    );
    assert.deepEqual(find({ ...input, quiet }), []);
    // Two owners: each owner's.
    const two = ["community/a/x", "community/a/w", "community/b/y"];
    assert.deepEqual(
        brief(
            find({
                catalog: two.map((n) => model(n)),
                schedule: Object.fromEntries(two.map((n) => [n, twice()])),
            }),
        ),
        two.map((n) => `stream ${n}`),
    );
    // Probed over 4 hours ago: not at once.
    const old = Object.fromEntries(
        shared.map((n) => [n, twice({ lastAt: NOW - 5 * HOUR })]),
    );
    assert.deepEqual(
        brief(find({ ...input, schedule: old })),
        shared.map((n) => `stream ${n}`),
    );
});

const PUBLIC = "community/o/public";
const leaning = (rescued, successes, extra) => [
    {
        model: "community/o/m",
        is_rollup: 1,
        status_2xx: successes,
        fallback_rescues: rescued,
        ...extra,
    },
    {
        model: "community/o/m",
        is_rollup: 0,
        fallback_used: true,
        model_used: PUBLIC,
        fallback_rescues: rescued - 2,
    },
    {
        model: "community/o/m",
        is_rollup: 0,
        fallback_used: true,
        model_used: "community/x/hidden",
        fallback_rescues: 2,
    },
];

test("a fallback notice from 10 rescues and 25% of successes, private fallbacks unnamed", () => {
    const catalog = [model("community/o/m"), model(PUBLIC)];
    const [notice] = find({ catalog, rows: leaning(10, 40) });
    assert.deepEqual(notice, {
        id: "1",
        kind: "fallback",
        to: "community",
        model: "community/o/m",
        rescued: 10,
        successes: 40,
        via: [
            { model: PUBLIC, rescued: 8 },
            { model: "private", rescued: 2 },
        ],
        owners: ["o"],
        quiet: [
            fallbackKey("community/o/m", PUBLIC),
            fallbackKey("community/o/m", "private"),
        ],
    });
    assert.deepEqual(find({ catalog, rows: leaning(9, 36) }), []);
    assert.deepEqual(find({ catalog, rows: leaning(10, 41) }), []);
});

test("a told fallback stays quiet for a week, per model and fallback", () => {
    const catalog = [model("community/o/m"), model(PUBLIC)];
    const key = fallbackKey("community/o/m", PUBLIC);
    const [notice] = find({
        catalog,
        rows: leaning(10, 40),
        quiet: { [key]: NOW - 7 * DAY + 1 },
    });
    assert.deepEqual(notice.via, [{ model: "private", rescued: 2 }]);
    const [later] = find({
        catalog,
        rows: leaning(10, 40),
        quiet: { [key]: NOW - 7 * DAY },
    });
    assert.equal(later.via.length, 2);
});

test("listing changes are an incident only when something changed", () => {
    const changes = {
        filtered: 1,
        newly: [{ model: "community/o/a", health: 20 }],
        back: [],
    };
    assert.deepEqual(brief(find({ listings: changes })), [
        "listings undefined",
    ]);
    assert.deepEqual(
        find({ listings: { filtered: 1, newly: [], back: [] } }),
        [],
    );
});

// Incidents code found: a broken stream and a fallback for owners o and p,
// listing changes, and a shared break for the maintainers.
const FOUND = [
    { id: "1", kind: "stream", to: "community", owners: ["o"], quiet: [] },
    { id: "2", kind: "fallback", to: "community", owners: ["p"], quiet: [] },
    { id: "3", kind: "listings", to: "community", owners: [], quiet: [] },
    { id: "4", kind: "shared", to: "maintainers", owners: [], quiet: [] },
];
const answer = (value) => decision(JSON.stringify(value), FOUND);

test("a post holds only incidents code found for its channel, and pings only their owners", () => {
    const plan = answer({
        community: {
            text: "Streams and fallbacks",
            incidents: ["1", "1", "3", "4", "9"],
            owners: ["p", "everyone"],
        },
        maintainers: { text: "Gen", incidents: ["4", "2"] },
    });
    assert.deepEqual(
        plan.community.incidents.map((i) => i.id),
        ["1", "3"],
    );
    assert.deepEqual(plan.community.owners, ["o"]);
    assert.deepEqual(
        plan.maintainers.incidents.map((i) => i.id),
        ["4"],
    );
    // A post telling no incident code found isn't sent.
    assert.deepEqual(
        answer({ community: { text: "Made up", incidents: ["9"] } }),
        { community: null, maintainers: null },
    );
    assert.equal(decision("not json", FOUND), null);
});

test("a post carries no link of the agent's own, and fits Discord", () => {
    const text = [
        "[Owner dashboard](https:\\/\\/evil.example/login)",
        "https\\://evil.example/a <https://evil.example/b>",
        "1https://evil.example/d _https://evil.example/e_ www.evil.example/c",
        "done",
    ].join(" ");
    const plan = answer({
        community: { text, incidents: ["1"] },
        maintainers: { text, incidents: ["4"] },
    });
    for (const post of [plan.community.text, plan.maintainers.text]) {
        const own = post.replace(/\n\nOwners see .*$/s, "");
        assert.doesNotMatch(own, /https?:|www\.|\]\(/i);
        assert.match(own, /^Owner dashboard .*done$/);
    }
    assert.match(
        plan.community.text,
        /\[My Models\]\(https:\/\/enter\.pollinations\.ai\/my-models\)\.$/,
    );
    assert.doesNotMatch(plan.maintainers.text, /My Models/);
    const long = answer({
        community: { text: "x".repeat(5000), incidents: ["1"] },
    });
    assert.equal(long.community.text.length, 4096);
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
