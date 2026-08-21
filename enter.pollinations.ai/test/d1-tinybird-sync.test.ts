import { env } from "cloudflare:test";
import { expect } from "vitest";
import {
    D1_TINYBIRD_DATASOURCES,
    exportD1TinybirdPage,
} from "../src/services/d1-tinybird-sync.ts";
import { test } from "./fixtures.ts";

test.each(
    D1_TINYBIRD_DATASOURCES,
)("exports a valid page from %s using the real D1 schema", async (datasource) => {
    const page = await exportD1TinybirdPage(env.DB, datasource);

    expect(page).toEqual({
        datasource,
        rows: [],
        nextCursor: null,
        done: true,
    });
});

test("exports large tables with keyset pagination", async () => {
    await env.DB.prepare(`
        WITH digits(n) AS (
            VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)
        ), numbers AS (
            SELECT ones.n + tens.n * 10 + hundreds.n * 100 + thousands.n * 1000 AS n
            FROM digits ones
            CROSS JOIN digits tens
            CROSS JOIN digits hundreds
            CROSS JOIN digits thousands
        )
        INSERT INTO user (
            id, name, email, email_verified, created_at, updated_at, tier,
            auto_top_up_enabled
        )
        SELECT
            printf('id-%05d', n),
            printf('user-%05d', n),
            printf('user-%05d@example.com', n),
            0, 0, 0, 'spore', 0
        FROM numbers
        WHERE n <= 5000
    `).run();

    const first = await exportD1TinybirdPage(env.DB, "d1_user");
    expect(first.rows).toHaveLength(5000);
    expect(first.nextCursor).toBe("id-04999");
    expect(first.done).toBe(false);

    const second = await exportD1TinybirdPage(
        env.DB,
        "d1_user",
        first.nextCursor ?? undefined,
    );
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]?.id).toBe("id-05000");
    expect(second.nextCursor).toBeNull();
    expect(second.done).toBe(true);
});
