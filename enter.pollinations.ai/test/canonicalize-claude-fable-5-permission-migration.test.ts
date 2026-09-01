import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0060_canonicalize_claude_fable_5_permission.sql?raw";

describe("canonicalize Claude Fable 5 permission migration", () => {
    it("canonicalizes Fable IDs without changing unrelated permissions", async () => {
        await env.DB.prepare(`
            CREATE TABLE claude_fable_5_permission_apikey (
                id TEXT PRIMARY KEY,
                permissions TEXT
            )
        `).run();
        const edgeRows = new Map<string, string | null>([
            [
                "retired-only",
                JSON.stringify({
                    models: ["claude-fable-5", "flux"],
                    note: "keep",
                }),
            ],
            [
                "aliases-and-canonical",
                JSON.stringify({
                    models: [
                        "anthropic/claude-fable-5",
                        "unknown-model",
                        "claude-fable-5.1",
                        "anthropic/claude-fable-5.1",
                    ],
                    account: ["profile"],
                }),
            ],
            ["unrelated", JSON.stringify({ models: ["flux", "flux"] })],
            ["missing-models", JSON.stringify({ note: "claude-fable-5" })],
            ["non-array", JSON.stringify({ models: "claude-fable-5" })],
            ["invalid-json", '{"models":["claude-fable-5"]'],
            ["unrestricted", null],
        ]);
        await env.DB.batch(
            [...edgeRows].map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO claude_fable_5_permission_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const statements = migrationSql
            .replace(/\bapikey\b/g, "claude_fable_5_permission_apikey")
            .split(";")
            .map((statement) => statement.trim())
            .filter(Boolean);
        const runMigration = () =>
            env.DB.batch(
                statements.map((statement) => env.DB.prepare(statement)),
            );
        await runMigration();

        const rows = await env.DB.prepare(`
            SELECT id, permissions
            FROM claude_fable_5_permission_apikey
            ORDER BY id
        `).all<{ id: string; permissions: string | null }>();
        const permissions = Object.fromEntries(
            rows.results.map((row) => [row.id, row.permissions]),
        );

        expect(JSON.parse(permissions["retired-only"] as string)).toEqual({
            models: ["anthropic/claude-fable-5.1", "flux"],
            note: "keep",
        });
        expect(
            JSON.parse(permissions["aliases-and-canonical"] as string),
        ).toEqual({
            models: ["anthropic/claude-fable-5.1", "unknown-model"],
            account: ["profile"],
        });
        expect(JSON.parse(permissions.unrelated as string)).toEqual({
            models: ["flux", "flux"],
        });
        for (const id of [
            "missing-models",
            "non-array",
            "invalid-json",
            "unrestricted",
        ]) {
            expect(permissions[id]).toBe(edgeRows.get(id));
        }

        await env.DB.prepare(`
            CREATE TABLE claude_fable_5_permission_snapshot AS
            SELECT id, permissions FROM claude_fable_5_permission_apikey
        `).run();
        await runMigration();
        const changedOnSecondRun = await env.DB.prepare(`
            SELECT count(*) AS count
            FROM claude_fable_5_permission_apikey AS current
            JOIN claude_fable_5_permission_snapshot AS snapshot USING (id)
            WHERE current.permissions IS NOT snapshot.permissions
        `).first<{ count: number }>();
        expect(changedOnSecondRun?.count).toBe(0);
    });
});
