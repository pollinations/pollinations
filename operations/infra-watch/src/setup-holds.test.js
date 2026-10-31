import assert from "node:assert/strict";
import { test } from "node:test";
import {
    holdDomains,
    listAll,
    pending,
    reviewEvidence,
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

// A review card's accounts: the five oldest of seven requests.
const listed = () => ({
    domain: "farm.com",
    accounts: pending(
        Array.from({ length: 7 }, (_, i) => request(`u${i}`, "farm.com")),
        [],
    )
        .get("farm.com")
        .slice(0, 5),
});

test("the model reads numbers for the listed accounts only, never their ids", () => {
    const review = listed();
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

test("only a plain APPROVE or DECLINE line reaches the post", () => {
    assert.equal(
        verdict("**DECLINE**: 400 sign-ups in [one day](https://x.y) <@123>"),
        "DECLINE: 400 sign-ups in one day 123",
    );
    assert.equal(verdict("approve - steady use"), "APPROVE: steady use");
    assert.equal(verdict("Run `rm -rf` to approve"), null);
    assert.equal(verdict(null), null);
});
