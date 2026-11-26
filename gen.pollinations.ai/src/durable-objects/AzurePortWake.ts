import { DurableObject } from "cloudflare:workers";
import { azureIngressToken } from "../routes/azure-sandboxes.ts";
import { findSharedPort, type SharedPort, wakePort } from "../routes/e2b.ts";
import {
    type DiscordJob,
    reportDiscordWakeFailure,
} from "../routes/sandbox-discord.ts";

const DISCORD_PREFIX = "discord:";
type Delivery = { share: SharedPort; job: DiscordJob };

export class AzurePortWake extends DurableObject<CloudflareBindings> {
    private pending = Promise.resolve();
    private delivering = Promise.resolve();

    async enqueueDiscord(share: SharedPort, job: DiscordJob) {
        const id = DISCORD_PREFIX + job.id;
        await this.ctx.storage.transaction(async (storage) => {
            if (await storage.get(id)) return;
            await storage.put(id, { share, job } satisfies Delivery);
            await storage.setAlarm(Date.now() + 250);
        });
    }

    async alarm() {
        const next = this.delivering.then(() => this.deliverDiscordJobs());
        this.delivering = next.catch(() => {});
        await next;
    }

    private async deliverDiscordJobs() {
        const batch = await this.ctx.storage.list<Delivery>({
            prefix: DISCORD_PREFIX,
            limit: 16,
        });
        await Promise.all(
            Array.from(batch, async ([id, { share, job }]) => {
                if (Date.now() < job.expiresAt) {
                    try {
                        const current = await findSharedPort(
                            this.env,
                            share.sandboxId,
                            share.port,
                        );
                        if (
                            !current ||
                            current.discordPublicKey !==
                                share.discordPublicKey ||
                            current.apiKeyId !== share.apiKeyId
                        ) {
                            throw new Error("Discord port share changed");
                        }
                        const woken = await this.wake(current);
                        if (woken instanceof Response)
                            throw new Error("Sandbox wake failed");
                        const response = await fetch(woken.origin, {
                            method: "POST",
                            body: job.body,
                            headers: {
                                authorization: `Bearer ${await azureIngressToken(this.env)}`,
                                "content-type": "application/json",
                            },
                            redirect: "manual",
                            signal: AbortSignal.timeout(10000),
                        });
                        await response.body?.cancel();
                        if (!response.ok)
                            throw new Error("Sandbox rejected the command");
                    } catch (error) {
                        console.warn(
                            "Discord sandbox dispatch failed",
                            share.sandboxId,
                            error instanceof Error ? error.name : "Error",
                        );
                        await reportDiscordWakeFailure(job).catch(() => {});
                    }
                }
                await this.ctx.storage.delete(id);
            }),
        );
        if (batch.size === 16) await this.ctx.storage.setAlarm(Date.now());
    }

    async wake(share: SharedPort) {
        await this.pending;
        const result = await wakePort(this.env, this.ctx, share, () =>
            this.coordinate(share),
        );
        // Azure may report Running before a concurrent wake finishes billing.
        await this.pending;
        return result;
    }

    // Paid requests can check their leases concurrently. Serialize the
    // operations that can buy more time, then reread state inside the lock.
    private coordinate(share: SharedPort) {
        const next = this.pending.then(() =>
            wakePort(this.env, this.ctx, share),
        );
        this.pending = next.then(
            () => {},
            () => {},
        );
        return next;
    }
}
