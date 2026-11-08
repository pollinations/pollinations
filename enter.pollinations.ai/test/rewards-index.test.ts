import { env } from "cloudflare:test";
import { expect, it } from "vitest";

// Each monthly standings view runs both lookups; without these indexes they
// scanned every reward and overloaded D1.
it("reads supporter and monthly standings rewards without scanning the table", async () => {
    for (const query of [
        "SELECT user_id FROM rewards WHERE quest_id IN ('first_top_up', 'auto_top_up')",
        "SELECT user_id, pollen_amount FROM rewards WHERE earned_at >= unixepoch() - 86400",
    ]) {
        const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query}`).all<{
            detail: string;
        }>();
        const details = plan.results.map((row) => row.detail).join("\n");
        expect(details).not.toMatch(/SCAN rewards/);
        expect(details).toMatch(/idx_rewards_(quest_user|earned_at)/);
    }
});
