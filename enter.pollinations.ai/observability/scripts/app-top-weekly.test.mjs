import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Execute the real pipe SQL with in-query fixtures. No datasource writes or deploys.
// Run with the existing staging TB_TOKEN and TB_HOST explicitly set.
test("weekly ranking attributes and counts only eligible catalog requests", async () => {
    assert.ok(process.env.TB_TOKEN, "Set the existing staging TB_TOKEN");
    assert.ok(process.env.TB_HOST, "Set the staging TB_HOST explicitly");
    const source = await readFile(
        new URL("../endpoints/app_top_weekly.pipe", import.meta.url),
        "utf8",
    );
    const synced_at = "2026-09-27 00:00:00";
    const users = [
        {
            id: "owner",
            github_id: 1,
            github_username: "builder",
            banned: 0,
            synced_at,
        },
        {
            id: "banned-owner",
            github_id: 2,
            github_username: "banned",
            banned: 1,
            synced_at,
        },
        {
            id: "banned-payer",
            github_id: 3,
            github_username: "payer",
            banned: 1,
            synced_at,
        },
    ];
    const keys = [];
    const catalog = [];
    const events = [];
    const register = (id, uris, user_id = "owner") => {
        keys.push({
            id,
            user_id,
            prefix: "pk",
            metadata: JSON.stringify({
                keyType: "publishable",
                redirectUris: uris,
            }),
            synced_at,
        });
    };
    const listing = (name, web_url, github_user_id = "1") => {
        catalog.push({
            name,
            web_url,
            github_user_id,
            github_username: "builder",
        });
    };
    const request = (api_key_client_id, overrides = {}) => {
        events.push({
            api_key_client_id,
            api_key_created_via: "redirect-auth",
            start_time: "2026-09-27 10:00:00",
            environment: "production",
            user_id: "payer",
            is_final: 1,
            is_billed_usage: 1,
            response_status: 200,
            total_price: 0.1,
            ...overrides,
        });
    };

    listing("Alpha", "https://shared.example/a/");
    // Duplicate catalog rows and two callbacks must not multiply counts.
    listing("Alpha", "https://shared.example/a/");
    register("alpha", [
        "http://localhost:3000",
        "https://shared.example/a/callback",
        "https://shared.example/a/",
    ]);
    register("alpha-second-key", ["https://shared.example/a?connected=true"]);
    request("alpha");
    request("alpha");
    request("alpha-second-key");
    listing("Beta", "https://beta.example");
    register("beta", ["https://beta.example/auth/callback"]);
    request("beta");
    request("beta");

    // Path boundaries, ownership and ambiguous registrations all fail closed.
    register("unlisted", ["https://shared.example/unlisted"]);
    register("prefix-collision", ["https://shared.example/another"]);
    register("wrong-owner", ["https://beta.example"], "banned-owner");
    listing("Wrong owner", "https://wrong-owner.example", "99");
    register("unmatched-owner", ["https://wrong-owner.example"]);
    listing("Root app", "https://ambiguous.example");
    listing("Nested app", "https://ambiguous.example/app");
    register("ambiguous", ["https://ambiguous.example/app/callback"]);
    listing("Banned owner", "https://banned.example", "2");
    register("banned-owner-key", ["https://banned.example"], "banned-owner");
    keys.push({
        id: "null-metadata",
        user_id: "owner",
        prefix: "pk",
        metadata: null,
        synced_at,
    });
    for (const id of [
        "unlisted",
        "prefix-collision",
        "wrong-owner",
        "unmatched-owner",
        "ambiguous",
        "banned-owner-key",
        "null-metadata",
    ]) {
        for (let i = 0; i < 12; i++) request(id);
    }
    for (const overrides of [
        { response_status: 500 },
        { is_final: 0 },
        { is_billed_usage: 0 },
        { total_price: 0 },
        { user_id: "banned-payer" },
        { environment: "staging" },
        { api_key_created_via: "dashboard" },
        { start_time: "2026-09-20 12:00:00" },
        { start_time: "2026-09-28 12:00:00" },
    ])
        request("alpha", overrides);

    // There are more than ten unfiltered candidates; LIMIT must follow matching.
    for (let i = 0; i < 12; i++) {
        const name = `Rank${String(i).padStart(2, "0")}`;
        listing(name, `https://${name}.example`);
        register(name, [`https://${name}.example`]);
        request(name);
    }

    const literal = (value) =>
        value === null
            ? "NULL"
            : typeof value === "number"
              ? String(value)
              : `'${value.replaceAll("'", "''")}'`;
    const fixture = (rows) =>
        rows
            .map(
                (row) =>
                    `SELECT ${Object.entries(row)
                        .map(
                            ([key, value]) =>
                                `${key === "start_time" ? `toDateTime(${literal(value)})` : literal(value)} AS ${key}`,
                        )
                        .join(", ")}`,
            )
            .join(" UNION ALL ");
    const data = {
        d1_user: users,
        d1_apikey: keys,
        app_directory: catalog,
        generation_event_v2: events,
    };
    const nodes = [
        ...source.matchAll(
            /NODE (\w+)\s+SQL >\n([\s\S]*?)(?=\nNODE |\nTYPE |$)/g,
        ),
    ];
    assert.equal(nodes.length, 6);
    const queryFor = (limit) => {
        const ctes = Object.entries(data).map(
            ([name, rows]) => `fixture_${name} AS (${fixture(rows)})`,
        );
        for (const [, name, sql] of nodes) {
            ctes.push(
                `${name} AS (${sql
                    .replace(/^\s*%\s*/, "")
                    .replaceAll("now()", "toDateTime('2026-09-27 12:00:00')")
                    .replace(/\{\{\s*UInt8\(limit, 10\)\s*\}\}/g, String(limit))
                    .replace(
                        /\b(d1_user|d1_apikey|app_directory|generation_event_v2)\b/g,
                        "fixture_$1",
                    )})`,
            );
        }
        return `WITH ${ctes.join(",\n")} SELECT * FROM app_top_weekly_node FORMAT JSON`;
    };
    for (const limit of [8, 10]) {
        const response = await fetch(new URL("/v0/sql", process.env.TB_HOST), {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.TB_TOKEN}` },
            body: new URLSearchParams({ q: queryFor(limit) }),
        });
        const result = await response.json();
        assert.equal(response.status, 200, result.error);
        assert.equal(result.error, undefined);
        assert.equal(result.data.length, limit);
        assert.deepEqual(
            result.data.map(({ app_name, request_count }) => [
                app_name,
                request_count,
            ]),
            [
                ["Alpha", 3],
                ["Beta", 2],
                ...Array.from({ length: limit - 2 }, (_, i) => [
                    `Rank${String(i).padStart(2, "0")}`,
                    1,
                ]),
            ],
        );
        assert.ok(result.data.every(({ owner }) => owner === "builder"));
    }
});
