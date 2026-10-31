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

test("a burst holds its domain once and never overrides a release", async () => {
    const kv = store({ "hold:kept.com": "released" });
    const rows = await holdDomains(kv, [
        { domain: "farm.com", accounts: 31 },
        { domain: "kept.com", accounts: 40 },
    ]);
    assert.deepEqual(
        rows.map((r) => r.hold),
        ["held", "released"],
    );
    assert.equal(kv.values.get("hold:farm.com"), "held");
    assert.equal(kv.values.get("hold:kept.com"), "released");
});

test("only pending requests are reviewed, grouped by domain, across list pages", async () => {
    const kv = store();
    for (const [id, domain] of [
        ["a", "farm.com"],
        ["b", "farm.com"],
        ["c", "school.edu"],
    ])
        await kv.put(`review:${id}`, "pending", request(id, domain));
    // A maintainer's decision replaces the value and drops the metadata.
    await kv.put("review:d", "approved");
    const groups = pending(await listAll(kv, "review:"));
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

test("a domain is reviewed once a day, again only for newer requests", () => {
    const groups = pending([request("a", "farm.com")]);
    const first = due(groups, {}, NOW);
    assert.deepEqual(
        first.picked.map((r) => r.domain),
        ["farm.com"],
    );
    const reviewed = mark(first.state, first.picked[0], NOW);
    // Same requests, a day later: nothing new to review.
    assert.equal(due(groups, reviewed, NOW + 2 * DAY).picked.length, 0);
    // A newer request, but within the day: waits.
    const newer = pending([
        request("a", "farm.com"),
        request("b", "farm.com", NOW + 1000),
    ]);
    assert.equal(due(newer, reviewed, NOW + 1000).picked.length, 0);
    assert.equal(due(newer, reviewed, NOW + DAY).picked.length, 1);
});

test("reviews stop at the daily limit and start again the next day", () => {
    const groups = pending(
        Array.from({ length: REVIEW_DAILY_LIMIT + 3 }, (_, i) =>
            request(`u${i}`, `d${i}.com`),
        ),
    );
    const today = due(groups, {}, NOW);
    assert.equal(today.picked.length, REVIEW_DAILY_LIMIT);
    assert.equal(due(groups, today.state, NOW + 1000).picked.length, 0);
    assert.equal(
        due(groups, today.state, NOW + DAY).picked.length,
        REVIEW_DAILY_LIMIT,
    );
});

test("the model reads numbers by account position, never account ids", () => {
    const review = {
        domain: "farm.com",
        accounts: pending([
            request("secret-a", "farm.com"),
            request("secret-b", "farm.com"),
        ]).get("farm.com"),
    };
    const facts = reviewEvidence(
        review,
        [{ day: "2026-10-30", accounts: 400 }],
        [
            {
                user_id: "secret-a",
                requests: 12,
                models: 2,
                last_request: (NOW - DAY) / 1000,
            },
        ],
        NOW,
    );
    assert.doesNotMatch(JSON.stringify(facts), /secret/);
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

test("the review post lists commands for at most five accounts and the domain", () => {
    const accounts = pending(
        Array.from({ length: 7 }, (_, i) => request(`u${i}`, "farm.com")),
    ).get("farm.com");
    const review = { domain: "farm.com", accounts };
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
    assert.match(text, /430 in 30d, 400 on 2026-10-30/);
    assert.match(text, /1 of 7 in 30d/);
    assert.match(text, /↳ DECLINE: 400 sign-ups in a day\./);
    assert.match(text, /2 more waiting\./);
    assert.equal(text.match(/'review:u\d' approved/g).length, 5);
    assert.equal(text.match(/'review:u\d' declined/g).length, 5);
    assert.match(text, /'hold:farm\.com' released/);
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
