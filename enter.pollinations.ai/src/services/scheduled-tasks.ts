import { runTierRefill } from "./tier-refill.ts";

/**
 * The full scheduled pipeline, in one place so the cron and a manual admin
 * trigger run exactly the same thing. `scheduled()` calls this; so does
 * POST /api/admin/trigger-scheduled.
 */
export async function runScheduledTasks(
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<{
    tierRefill: { ok: boolean; error?: string };
}> {
    const result = {
        tierRefill: { ok: true } as { ok: boolean; error?: string },
    };

    await runTierRefill(env, ctx).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Tier refill failed:", error);
        result.tierRefill = { ok: false, error: message };
    });

    return result;
}
