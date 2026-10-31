import assert from "node:assert/strict";
import { test } from "node:test";
import {
    due,
    holdDomains,
    listAll,
    mark,
    pending,
    REVIEW_DAILY_LIMIT,
    reviewEvidence,
    reviewMessage,
    verdict,
} from "./setup-holds.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 31, 12);

// The KV calls this module makes, over a Map; list pages hold two keys.
function store(entries = {}) {
    const values = new Map(Object.entries(entries));
    const metadata = new Map();
    return {
        values,
        metadata,
        get: async (key) => values.get(key) ?? null,
        put: async (key, value, options) => {
            values.set(key, value);
            metadata.set(key, options?.metadata ?? null);
        },
        list: async ({ prefix, cursor }) => {
            const names = [...values.keys()].filter((k) =>
                k.startsWith(prefix),
            );
            const start = Number(cursor ?? 0);
            const keys = names.slice(start, start + 2).map((name) => ({
                name,
                metadata: metadata.get(name) ?? undefined,
            }));
            const done = start + 2 >= names.length;
            return {
                keys,
                list_complete: done,
                cursor: done ? undefined : String(start + 2),
            };
        },
    };
}

const request = (userId, domain, requestedAt = NOW) => ({
    name: `review:${userId}`,
    metadata: {
        domain,
        requestedAt,
        createdAt: NOW - 2 * DAY,
        rewards: 3,
        rewardPollen: 2.5,
    },
});

test("a burst holds its domain, and a maintainer's release always wins", async () => {
    const kv = store({ "release:kept.com": "released" });
    const rows = await holdDomains(kv, [
        { domain: "farm.com", accounts: 31 },
        { domain: "kept.com", accounts: 40 },
    ]);
    assert.deepEqual(
        rows.map((r) => r.hold),
        ["held", "released"],
    );
    assert.equal(kv.values.get("hold:farm.com"), "held");
    // The release stays: infra-watch writes only hold: keys.
    assert.equal(kv.values.get("release:kept.com"), "released");
});

test("pending requests have no decision, grouped by domain, oldest first, across list pages", async () => {
    const kv = store();
    for (const [id, domain, at] of [
        ["b", "farm.com", NOW + 1],
        ["a", "farm.com", NOW],
        ["c", "school.edu", NOW],
        ["d", "farm.com", NOW],
    ])
        await kv.put(`review:${id}`, "pending", request(id, domain, at));
    await kv.put("decision:d", "approved");
    const groups = pending(
        await listAll(kv, "review:"),
        await listAll(kv, "decision:"),
    );
    assert.deepEqual(
        [...groups].map(([domain, accounts]) => [
            domain,
            accounts.map((a) => a.userId),
        ]),
        [
            ["farm.com", ["a", "b"]],
            ["school.edu", ["c"]],
        ],
    );
});

test("each review lists the next five unlisted requests, a day apart", () => {
    // Seven requests in the same millisecond: ties still come in turn.
    const groups = pending(
        Array.from({ length: 7 }, (_, i) => request(`u${i}`, "farm.com")),
        [],
    );
    const first = due(groups, {}, NOW);
    assert.deepEqual(
        first.picked[0].listed.map((a) => a.userId),
        ["u0", "u1", "u2", "u3", "u4"],
    );
    assert.equal(first.picked[0].waiting, 7);
    const reviewed = mark(first.state, first.picked[0], NOW);
    assert.equal(due(groups, reviewed, NOW + 1000).picked.length, 0);
    const next = due(groups, reviewed, NOW + DAY);
    assert.deepEqual(
        next.picked[0].listed.map((a) => a.userId),
        ["u5", "u6"],
    );
    // All listed and still undecided: nothing more to post.
    const done = mark(next.state, next.picked[0], NOW + DAY);
    assert.equal(due(groups, done, NOW + 3 * DAY).picked.length, 0);
});

test("a request KV shows late, or tied with mixed-case ids, is still listed", () => {
    const later = [
        request("a", "farm.com", NOW + 10),
        request("B", "farm.com", NOW + 10),
    ];
    const first = due(pending(later, []), {}, NOW);
    const reviewed = mark(first.state, first.picked[0], NOW);
    // An older request becomes visible only after that review.
    const late = pending([request("old", "farm.com", NOW), ...later], []);
    const next = due(late, reviewed, NOW + DAY);
    assert.deepEqual(
        next.picked[0].listed.map((a) => a.userId),
        ["old"],
    );
    // A decided request drops out of what is tracked; a new one is listed.
    const done = mark(next.state, next.picked[0], NOW + DAY);
    const after = pending(
        [
            request("old", "farm.com", NOW),
            later[0],
            request("c", "farm.com", NOW + 20),
        ],
        [],
    );
    const third = due(after, done, NOW + 2 * DAY);
    assert.deepEqual(
        third.picked[0].listed.map((a) => a.userId),
        ["c"],
    );
    assert.deepEqual(
        mark(third.state, third.picked[0], NOW + 2 * DAY).domains["farm.com"]
            .posted,
        ["a", "old", "c"],
    );
});

test("reviews stop at the daily limit and start again the next day", () => {
    const groups = pending(
        Array.from({ length: REVIEW_DAILY_LIMIT + 3 }, (_, i) =>
            request(`u${i}`, `d${i}.com`),
        ),
        [],
    );
    const today = due(groups, {}, NOW);
    assert.equal(today.picked.length, REVIEW_DAILY_LIMIT);
    assert.equal(due(groups, today.state, NOW + 1000).picked.length, 0);
    assert.equal(
        due(groups, today.state, NOW + DAY).picked.length,
        REVIEW_DAILY_LIMIT,
    );
});

// A review as due() picks it: the first five of seven pending requests.
const sevenAsking = () =>
    due(
        pending(
            Array.from({ length: 7 }, (_, i) => request(`u${i}`, "farm.com")),
            [],
        ),
        {},
        NOW,
    ).picked[0];

test("the model reads numbers for the listed accounts only, never their ids", () => {
    const review = sevenAsking();
    const facts = reviewEvidence(
        review,
        [{ day: "2026-10-30", accounts: 400 }],
        [
            {
                user_id: "u0",
                requests: 12,
                models: 2,
                last_request: (NOW - DAY) / 1000,
            },
        ],
        NOW,
    );
    assert.doesNotMatch(JSON.stringify(facts), /u\d/);
    assert.equal(facts.accounts.length, 5);
    assert.deepEqual(facts.accounts[0], {
        account: 1,
        ageDays: 2,
        rewards: 3,
        rewardPollen: 2.5,
        requests30d: 12,
        models30d: 2,
        lastRequestDaysAgo: 1,
    });
    assert.equal(facts.accounts[1].requests30d, 0);
    assert.equal(
        reviewEvidence(review, [], { error: "down" }, NOW).accounts[0]
            .requests30d,
        "unknown",
    );
});

test("the review post has decision commands for the listed accounts and a release for the domain", () => {
    const review = sevenAsking();
    const facts = reviewEvidence(
        review,
        [
            { day: "2026-10-29", accounts: 30 },
            { day: "2026-10-30", accounts: 400 },
        ],
        [{ user_id: "u0", requests: 1, models: 1, last_request: NOW / 1000 }],
        NOW,
    );
    const { text, ping, color } = reviewMessage(
        review,
        facts,
        "DECLINE: 400 sign-ups in a day.",
    );
    assert.equal(ping, false);
    assert.equal(color, 0xef9f27);
    assert.match(text, /REVIEW: domain farm\.com/);
    assert.match(text, /7 pending, 5 listed here/);
    assert.match(text, /430 in 30d, 400 on 2026-10-30/);
    assert.match(text, /1 of 5 in 30d/);
    assert.match(text, /↳ DECLINE: 400 sign-ups in a day\./);
    assert.match(text, /2 more waiting: the next review lists them\./);
    assert.equal(text.match(/'decision:u\d' approved/g).length, 5);
    assert.equal(text.match(/'decision:u\d' declined/g).length, 5);
    assert.match(text, /'release:farm\.com' released/);
    assert.match(
        reviewMessage(
            review,
            reviewEvidence(review, { error: "x" }, { error: "x" }, NOW),
            null,
        ).text,
        /unknown in 30d[\s\S]*API USE unknown[\s\S]*no AI recommendation/,
    );
});

test("only a plain APPROVE or DECLINE line reaches the post", () => {
    assert.equal(
        verdict("**DECLINE**: 400 sign-ups in [one day](https://x.y) <@123>"),
        "DECLINE: 400 sign-ups in one day 123",
    );
    assert.equal(verdict("approve - steady use"), "APPROVE: steady use");
    assert.equal(verdict("Run `rm -rf` to approve"), null);
    assert.equal(verdict(null), null);
});
