import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migrationSql from "../drizzle/0050_lying_speed.sql?raw";

type Row = { id: string; kind: string };

/**
 * The backfill collapses the two facts that used to mean "agent" — a prompt
 * agent's agent_id, and an admin-granted delegating flag — into one column,
 * without pulling in a row no code path ever delegated for.
 */
describe("community endpoint kind migration", () => {
    it("marks prompt agents and text delegating rows, and nothing else", async () => {
        await env.DB.prepare(`
            CREATE TABLE migration_community_endpoint (
                id TEXT PRIMARY KEY,
                agent_id TEXT,
                modality TEXT NOT NULL DEFAULT 'text',
                delegates_generation INTEGER NOT NULL DEFAULT 0
            )
        `).run();
        await env.DB.prepare(`
            INSERT INTO migration_community_endpoint
                (id, agent_id, modality, delegates_generation)
            VALUES
                ('prompt-agent', 'agent-row-id', 'text', 0),
                ('delegating-text', NULL, 'text', 1),
                ('delegating-image', NULL, 'image', 1),
                ('plain-model', NULL, 'text', 0),
                ('plain-image', NULL, 'image', 0)
        `).run();

        for (const statement of migrationSql.split(
            "--> statement-breakpoint",
        )) {
            await env.DB.prepare(
                statement.replace(
                    /`community_endpoint`/g,
                    "migration_community_endpoint",
                ),
            ).run();
        }

        const rows = await env.DB.prepare(
            "SELECT id, kind FROM migration_community_endpoint ORDER BY id",
        ).all<Row>();

        expect(
            Object.fromEntries(rows.results.map((row) => [row.id, row.kind])),
        ).toEqual({
            "prompt-agent": "agent",
            "delegating-text": "agent",
            // The image path never minted a run token, so the flag was inert
            // there and promoting the row would change how it is called.
            "delegating-image": "model",
            "plain-model": "model",
            "plain-image": "model",
        });
    });
});
