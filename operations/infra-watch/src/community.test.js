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
// Broken now, after passing the probe before.
const fresh = (extra) => broke({ before: { status: 200 }, ...extra });
const cycle = (input) =>
    incidents({
        catalog: [],
        rows: [],
        schedule: {},
        quiet: {},
        listings: null,
        now: NOW,
        ...input,
    });
const find = (input) => cycle(input).found;
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

test("one broken stream on 3 owners' working models within 4 hours is the maintainers', and none of the owners'", () => {
    const shared = ["community/a/x", "community/b/y", "community/c/z"];
    const input = {
        catalog: shared.map((n) => model(n)),
        schedule: Object.fromEntries(shared.map((n) => [n, fresh()])),
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
    // Two owners: not gen's, and once is not yet any owner's.
    const two = ["community/a/x", "community/a/w", "community/b/y"];
    assert.deepEqual(
        find({
            catalog: two.map((n) => model(n)),
            schedule: Object.fromEntries(two.map((n) => [n, fresh()])),
        }),
        [],
    );
    // Probed over 4 hours ago: not at once.
    const old = Object.fromEntries(
        shared.map((n) => [n, fresh({ lastAt: NOW - 5 * HOUR })]),
    );
    assert.deepEqual(find({ ...input, schedule: old }), []);
});

test("3 owners' models broken alike but not working before are never gen's", () => {
    // 2026-11-01: the first probes found 3 owners' endpoints that had sent
    // no token usage for over a week, and called it gen's.
    const owners = ["community/a/x", "community/b/y", "community/c/z"];
    const catalog = owners.map((n) => model(n));
    const first = Object.fromEntries(owners.map((n) => [n, broke()]));
    assert.deepEqual(find({ catalog, schedule: first }), []);
    // Broken again: each owner's own.
    const again = Object.fromEntries(owners.map((n) => [n, twice()]));
    assert.deepEqual(
        brief(find({ catalog, schedule: again })),
        owners.map((n) => `stream ${n}`),
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
        snapshots: [
            {
                from: new Date(NOW - 4 * HOUR).toISOString(),
                to: new Date(NOW).toISOString(),
                rescued: 10,
                successes: 40,
                via: [
                    { model: PUBLIC, rescued: 8 },
                    { model: "private", rescued: 2 },
                ],
            },
        ],
        owners: ["o"],
        quiet: [
            fallbackKey("community/o/m", PUBLIC),
            fallbackKey("community/o/m", "community/x/hidden"),
        ],
    });
    assert.deepEqual(find({ catalog, rows: leaning(9, 36) }), []);
    assert.deepEqual(find({ catalog, rows: leaning(10, 41) }), []);
});

test("two private fallbacks of one model are both kept, each unnamed", () => {
    const rows = [
        {
            model: "community/o/m",
            is_rollup: 1,
            status_2xx: 40,
            fallback_rescues: 30,
        },
        ...["community/x/a", "community/x/b"].map((used, i) => ({
            model: "community/o/m",
            is_rollup: 0,
            fallback_used: true,
            model_used: used,
            fallback_rescues: [25, 5][i],
        })),
    ];
    const [notice] = find({ catalog: [model("community/o/m")], rows });
    assert.deepEqual(notice.snapshots[0].via, [
        { model: "private", rescued: 25 },
        { model: "private", rescued: 5 },
    ]);
});

test("a told fallback stays quiet for a week, per model and fallback", () => {
    const catalog = [model("community/o/m"), model(PUBLIC)];
    const key = fallbackKey("community/o/m", PUBLIC);
    const [notice] = find({
        catalog,
        rows: leaning(10, 40),
        quiet: { [key]: NOW - 7 * DAY + 1 },
    });
    assert.deepEqual(notice.snapshots[0].via, [
        { model: "private", rescued: 2 },
    ]);
    const [later] = find({
        catalog,
        rows: leaning(10, 40),
        quiet: { [key]: NOW - 7 * DAY },
    });
    assert.equal(later.snapshots[0].via.length, 2);
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

test("a shared failure keeps its models until they are probed again, even past 4 hours", () => {
    const shared = ["community/a/x", "community/b/y", "community/c/z"];
    const catalog = shared.map((n) => model(n));
    const schedule = Object.fromEntries(shared.map((n) => [n, fresh()]));
    const first = cycle({ catalog, schedule });
    // Undelivered and 5 hours on, with no new probe: still gen's.
    const later = cycle({
        catalog,
        schedule,
        pending: first.pending,
        now: NOW + 5 * HOUR,
    });
    assert.deepEqual(brief(later.found), [`shared ${shared}`]);
    // Told, it still keeps them from their owners while unprobed.
    const quiet = Object.fromEntries(
        shared.map((n) => [streamKey(n, ERROR), NOW]),
    );
    assert.deepEqual(
        cycle({
            catalog,
            schedule,
            quiet,
            pending: first.pending,
            now: NOW + 5 * HOUR,
        }).found,
        [],
    );
    // A new probe of each is fresh evidence: older than 4 hours, they are
    // their owners' again.
    const reprobed = Object.fromEntries(
        shared.map((n) => [n, twice({ lastAt: NOW - 5 * HOUR })]),
    );
    assert.deepEqual(
        brief(
            cycle({ catalog, schedule: reprobed, pending: first.pending })
                .found,
        ),
        shared.map((n) => `stream ${n}`),
    );
});

test("a fallback notice is kept from when it qualifies until its fallbacks are told", () => {
    const catalog = [model("community/o/m"), model(PUBLIC)];
    const first = cycle({ catalog, rows: leaning(10, 40) });
    // Its rescues leave the 4-hour window: still pending.
    const later = cycle({ catalog, rows: [], pending: first.pending });
    assert.deepEqual(brief(later.found), ["fallback community/o/m"]);
    assert.equal(later.found[0].snapshots[0].rescued, 10);
    // Told: gone.
    const quiet = Object.fromEntries(
        later.found[0].quiet.map((key) => [key, NOW]),
    );
    const done = cycle({ catalog, rows: [], quiet, pending: later.pending });
    assert.deepEqual(done.found, []);
    assert.deepEqual(done.pending, {});
});

test("a shared failure keeps each model until that model is probed again, whatever the others do", () => {
    const shared = ["community/a/x", "community/b/y", "community/c/z"];
    const catalog = shared.map((n) => model(n));
    const schedule = Object.fromEntries(shared.map((n) => [n, fresh()]));
    const first = cycle({ catalog, schedule });
    // x is probed again and passes: y and z have no new evidence, so they
    // stay the maintainers', not their owners'.
    const later = cycle({
        catalog,
        schedule: {
            ...schedule,
            "community/a/x": { lastAt: NOW, status: 200 },
        },
        pending: first.pending,
        now: NOW + 5 * HOUR,
    });
    assert.deepEqual(brief(later.found), [
        "shared community/b/y,community/c/z",
    ]);
});

test("a pending fallback notice names a fallback only if it is still public when told", () => {
    const first = cycle({
        catalog: [model("community/o/m"), model(PUBLIC)],
        rows: leaning(10, 40),
    });
    // The fallback is made private before the notice goes out.
    const [notice] = cycle({
        catalog: [model("community/o/m")],
        pending: first.pending,
    }).found;
    assert.deepEqual(
        notice.snapshots[0].via.map((v) => v.model),
        ["private", "private"],
    );
    // What the agent reads names it nowhere; only code's quiet keys keep it.
    const { owners, quiet, ...read } = notice;
    assert.doesNotMatch(JSON.stringify(read), /community\/o\/public/);
});

test("a new fallback joins an untold one instead of replacing it", () => {
    const OTHER = "community/o/other";
    const catalog = [model("community/o/m"), model(PUBLIC), model(OTHER)];
    const first = cycle({ catalog, rows: leaning(10, 40) });
    // A new window leans on another fallback; the first is still untold.
    const rows = leaning(12, 40).map((r) =>
        r.model_used === PUBLIC ? { ...r, model_used: OTHER } : r,
    );
    const [notice] = cycle({
        catalog,
        rows,
        pending: first.pending,
        now: NOW + 5 * HOUR,
    }).found;
    // Each window keeps its own numbers: never one total over both.
    assert.deepEqual(
        notice.snapshots.map(({ to, rescued, successes, via }) => ({
            to,
            rescued,
            successes,
            via,
        })),
        [
            {
                to: new Date(NOW).toISOString(),
                rescued: 10,
                successes: 40,
                via: [{ model: PUBLIC, rescued: 8 }],
            },
            {
                to: new Date(NOW + 5 * HOUR).toISOString(),
                rescued: 12,
                successes: 40,
                via: [
                    { model: OTHER, rescued: 10 },
                    { model: "private", rescued: 2 },
                ],
            },
        ],
    );
    assert.equal(notice.rescued, undefined);
});

// Incidents code found: a broken stream and a fallback for owners o and p,
// listing changes, and a shared failure for the maintainers.
const stream = (id, owner) => ({
    id,
    kind: "stream",
    to: "community",
    model: `community/${owner}/m`,
    error: ERROR,
    owners: [owner],
    quiet: [],
});
const FOUND = [
    stream("1", "o"),
    {
        id: "2",
        kind: "fallback",
        to: "community",
        model: "community/p/m",
        snapshots: [
            {
                from: "2026-11-01T08:00:00.000Z",
                to: "2026-11-01T12:00:00.000Z",
                rescued: 12,
                successes: 40,
                via: [{ model: "private", rescued: 12 }],
            },
        ],
        owners: ["p"],
        quiet: [],
    },
    {
        id: "3",
        kind: "listings",
        to: "community",
        filtered: 1,
        newly: [{ model: "community/q/m", health: 40 }],
        back: [],
        owners: [],
        quiet: [],
    },
    {
        id: "4",
        kind: "shared",
        to: "maintainers",
        error: ERROR,
        models: ["community/a/x", "community/b/y", "community/c/z"],
        owners: [],
        quiet: [],
    },
];
const answer = (value) => decision(JSON.stringify(value), FOUND);
const line = (ids, text) => ({ incidents: ids, text });
// A post's text without its cards: the agent's lines and the footer.
const words = (text) => text.replace(/```ansi\n[\s\S]*?\n```\n/g, "");

test("a line tells only incidents code found for its channel, and pings only their owners", () => {
    const plan = answer({
        community: [
            line(["1"], "Stream"),
            line(["1"], "Again"),
            line(["4"], "Wrong channel"),
            line(["9"], "Made up"),
            line(["1", "4"], "Mixed"),
            line(["2", "3"], "Fallback and listings"),
        ],
        maintainers: [line(["4"], "Gen")],
    });
    assert.deepEqual(
        plan.community.incidents.map((i) => i.id),
        ["1", "2", "3"],
    );
    assert.match(
        words(plan.community.text),
        /^Stream\nFallback and listings\n\nOwners see/,
    );
    // Each line goes under its incidents' cards.
    assert.match(
        plan.community.text,
        /^```ansi\n┌─ .*COMMUNITY MODEL BROKEN: OWNER'S ENDPOINT[\s\S]*\nStream\n```ansi\n┌─ .*COMMUNITY MODEL RUNNING ON BACKUP[\s\S]*COMMUNITY MODELS HIDDEN OR BACK IN LIST[\s\S]*\nFallback and listings\n/,
    );
    assert.deepEqual(plan.community.owners, ["o", "p"]);
    assert.deepEqual(
        plan.maintainers.incidents.map((i) => i.id),
        ["4"],
    );
    assert.deepEqual(answer({ community: [line(["9"], "Made up")] }), {
        community: null,
        maintainers: null,
    });
    assert.equal(decision("not json", FOUND), null);
});

test("a line that doesn't fit is left out with its incident, which isn't pinged", () => {
    const plan = answer({
        community: [
            line(["1"], "x".repeat(3600)),
            line(["2"], "y".repeat(300)),
        ],
    });
    assert.ok(plan.community.text.length <= 4096);
    assert.doesNotMatch(plan.community.text, /yyy/);
    assert.deepEqual(
        plan.community.incidents.map((i) => i.id),
        ["1"],
    );
    assert.deepEqual(plan.community.owners, ["o"]);
});

test("a card's title says it is community models and whose fault, and its facts are never cut", () => {
    const long =
        "community/CloudCompile/nvidia-nemotron-3-ultra-550b-a55b:free";
    const models = [
        long,
        ...Array.from({ length: 11 }, (_, n) => `community/o${n}/m`),
    ];
    const error =
        "stream returned usage_missing: missing or invalid token usage";
    const plan = decision(
        JSON.stringify({ maintainers: [line(["1"], "Check gen.")] }),
        [{ ...FOUND[3], id: "1", error, models }],
    );
    const text = plan.maintainers.text;
    assert.match(text, /COMMUNITY MODELS: LIKELY A GEN PROBLEM/);
    for (const row of [
        "ERROR   usage_missing: missing or invalid token usage",
        "OWNERS  12",
        "MODELS  CloudCompile/nvidia-nemotron-3-ultra-550b-a55b:free",
        "        o8/m",
        "        …and 2 more",
    ])
        assert.ok(text.includes(`│ ${row}`), row);
    assert.doesNotMatch(text, /o9\/m/);
    assert.match(text, /\n```\nCheck gen\.$/);
});

test("a post carries no link of the agent's own", () => {
    const text = [
        "[Owner dashboard](https:\\/\\/evil.example/login)",
        "https\\://evil.example/a <https://evil.example/b>",
        "1https://evil.example/d _https://evil.example/e_ www.evil.example/c",
        "done",
    ].join(" ");
    const plan = answer({
        community: [line(["1"], text)],
        maintainers: [line(["4"], text)],
    });
    for (const post of [plan.community.text, plan.maintainers.text]) {
        const own = words(post).replace(/\n\nOwners see .*$/s, "");
        assert.doesNotMatch(own, /https?:|www\.|\]\(/i);
        assert.match(own, /^Owner dashboard .*done$/);
    }
    assert.match(
        plan.community.text,
        /\[My Models\]\(https:\/\/enter\.pollinations\.ai\/my-models\)\.$/,
    );
    assert.doesNotMatch(plan.maintainers.text, /My Models/);
});

test("a post's mentions fit Discord's 2,000 characters; owners that don't stay pending", () => {
    const owners = Array.from(
        { length: 100 },
        (_, i) => `owner-${String(i).padStart(24, "0")}`,
    );
    const found = owners.map((o, i) => stream(String(i + 1), o));
    const plan = decision(
        JSON.stringify({
            community: found.map((i) => ({
                incidents: [i.id],
                text: `x ${i.id}`,
            })),
        }),
        found,
    );
    const told = plan.community.incidents;
    assert.ok(told.length > 0 && told.length < 100);
    // Every owner it pings has an incident in it, and their names fit.
    assert.deepEqual(
        plan.community.owners,
        told.map((i) => i.owners[0]),
    );
    assert.ok(plan.community.owners.join(" ").length <= 2000);
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

test("a big listing change names 10 models and counts the rest", () => {
    const filtered = Array.from({ length: 200 }, (_, i) =>
        listed(`community/owner${i}/a-fairly-long-model-name-${i}`, 20),
    );
    const changes = listingChanges([], filtered, []);
    assert.equal(changes.newly.length, 10);
    assert.equal(changes.newlyMore, 190);
    assert.equal(changes.backMore, undefined);
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
