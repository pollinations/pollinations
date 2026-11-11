import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0077_decision-model-permissions.sql?raw";

const keyIds = [...migrationSql.matchAll(/'([A-Za-z0-9]{32})'/g)].map(
    (match) => match[1],
);

describe("decision model permissions migration", () => {
    it("adds decision to the listed keys that allow text, once", async () => {
        expect(keyIds).toHaveLength(48);
        const [textKey, textAndImage, alreadyDecision, imageOnly, unlimited] =
            keyIds;
        const invalid = keyIds[5];
        await env.DB.prepare(`
            CREATE TABLE decision_permission_apikey (
                id TEXT PRIMARY KEY,
                permissions TEXT
            )
        `).run();
        const rows = [
            [textKey, '{"models":["text"],"account":["usage"]}'],
            [textAndImage, '{"models":["text","image"]}'],
            [alreadyDecision, '{"models":["text","decision"]}'],
            [imageOnly, '{"models":["image"]}'],
            [unlimited, null],
            [invalid, '{"models":["text"]'],
            ["not-listed", '{"models":["text"]}'],
        ];
        await env.DB.batch(
            rows.map(([id, permissions]) =>
                env.DB.prepare(
                    "INSERT INTO decision_permission_apikey VALUES (?, ?)",
                ).bind(id, permissions),
            ),
        );

        const statement = migrationSql.replace(
            /\bapikey\b/g,
            "decision_permission_apikey",
        );
        await env.DB.prepare(statement).run();
        await env.DB.prepare(statement).run();

        const migrated = await env.DB.prepare(
            "SELECT id, permissions FROM decision_permission_apikey",
        ).all<{ id: string; permissions: string | null }>();
        const permissions = Object.fromEntries(
            migrated.results.map((row) => [row.id, row.permissions]),
        );
        expect(permissions).toEqual({
            [textKey]: '{"models":["text","decision"],"account":["usage"]}',
            [textAndImage]: '{"models":["text","image","decision"]}',
            [alreadyDecision]: '{"models":["text","decision"]}',
            [imageOnly]: '{"models":["image"]}',
            [unlimited]: null,
            [invalid]: '{"models":["text"]',
            "not-listed": '{"models":["text"]}',
        });
    });
});
