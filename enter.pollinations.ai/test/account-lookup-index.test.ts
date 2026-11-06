import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("looks up provider accounts without scanning unrelated accounts", async () => {
    await env.DB.prepare(
        "INSERT INTO user (id, name, email) VALUES ('lookup-owner', 'Lookup', 'lookup@example.test')",
    ).run();
    await env.DB.prepare(`
        WITH RECURSIVE subjects(n) AS (
            VALUES(1) UNION ALL SELECT n + 1 FROM subjects WHERE n < 1000
        )
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        SELECT 'github-' || n, CAST(n AS TEXT), 'github', 'lookup-owner', unixepoch()
        FROM subjects
    `).run();
    await env.DB.prepare(`
        INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
        VALUES ('google-500', '500', 'google', 'lookup-owner', unixepoch())
    `).run();

    for (const [subject, provider, expectedIds] of [
        ["500", "github", ["github-500"]],
        ["500", "google", ["google-500"]],
        ["missing", "github", []],
    ] as const) {
        const result = await env.DB.prepare(
            "SELECT * FROM account WHERE account_id = ? AND provider_id = ?",
        )
            .bind(subject, provider)
            .all<{ id: string }>();
        expect(result.results.map((row) => row.id)).toEqual(expectedIds);
        expect(result.meta.rows_read).toBeLessThan(10);
    }
});
