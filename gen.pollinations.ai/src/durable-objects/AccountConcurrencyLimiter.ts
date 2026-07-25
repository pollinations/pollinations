import { DurableObject } from "cloudflare:workers";

const LEASE_KEY = "lease";
const DEFAULT_LEASE_TTL_MS = 10 * 60 * 1000;

type Lease = {
    id: string;
    expiresAt: number;
};

export type AccountLeaseResult =
    | { allowed: true; leaseId: string }
    | { allowed: false };

/**
 * Coordinates active provider-backed generations for one account.
 *
 * The Durable Object name is the account (user) id, so a single active slot is
 * shared across every API key, model, and modality for that account. Expiring
 * leases prevent a crashed Worker from permanently occupying the slot.
 */
export class AccountConcurrencyLimiter extends DurableObject {
    private lease: Lease | undefined;

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.lease = await ctx.storage.get<Lease>(LEASE_KEY);
            if (this.lease && this.lease.expiresAt <= Date.now()) {
                await this.clearLease();
            }
        });
    }

    async acquire(
        leaseTtlMs = DEFAULT_LEASE_TTL_MS,
    ): Promise<AccountLeaseResult> {
        return this.ctx.blockConcurrencyWhile(async () => {
            if (this.lease) {
                if (this.lease.expiresAt > Date.now())
                    return { allowed: false };
                await this.clearLease();
            }

            const leaseId = crypto.randomUUID();
            this.lease = {
                id: leaseId,
                expiresAt: Date.now() + Math.max(1, Math.floor(leaseTtlMs)),
            };
            await this.ctx.storage.put(LEASE_KEY, this.lease);
            await this.ctx.storage.setAlarm(this.lease.expiresAt);
            return { allowed: true, leaseId };
        });
    }

    async release(leaseId: string): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            if (this.lease?.id !== leaseId) return;
            await this.clearLease();
        });
    }

    async alarm(): Promise<void> {
        await this.ctx.blockConcurrencyWhile(async () => {
            if (this.lease && this.lease.expiresAt <= Date.now()) {
                await this.clearLease();
            }
        });
    }

    private async clearLease(): Promise<void> {
        this.lease = undefined;
        await this.ctx.storage.delete(LEASE_KEY);
        await this.ctx.storage.deleteAlarm();
    }
}
