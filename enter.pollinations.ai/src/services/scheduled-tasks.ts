import { syncGithubMirror } from "./github-mirror.ts";
import { runTierRefill } from "./tier-refill.ts";

/**
 * The full scheduled pipeline, in one place so the cron and a manual admin
 * trigger run exactly the same thing. `scheduled()` calls this; so does
 * POST /api/admin/trigger-scheduled.
 *
 * GitHub mirroring is datasource sync only; quest rewards are checked on demand
 * by the authenticated dashboard user. Tier refill is independent and runs
 * concurrently. Errors are caught per-task so one failure doesn't sink the
 * others, and surfaced in the returned result for the manual trigger.
 */
export async function runScheduledTasks(
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<{
    mirror: { ok: boolean; error?: string };
    tierRefill: { ok: boolean; error?: string };
}> {
    const result = {
        mirror: { ok: true } as { ok: boolean; error?: string },
        tierRefill: { ok: true } as { ok: boolean; error?: string },
    };

    await Promise.allSettled([
        runTierRefill(env, ctx).catch((error) => {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error("Tier refill failed:", error);
            result.tierRefill = { ok: false, error: message };
        }),
        syncGithubMirror(env)
            .then((mirror) => {
                if (!mirror.ok) {
                    result.mirror = { ok: false, error: mirror.error };
                }
            })
            .catch((error) => {
                const message =
                    error instanceof Error ? error.message : String(error);
                console.error("GitHub mirror sync failed:", error);
                result.mirror = { ok: false, error: message };
            }),
    ]);

    return result;
}
