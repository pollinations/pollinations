import { DurableObject } from "cloudflare:workers";
import { type SharedPort, wakePort } from "../routes/e2b.ts";

export class AzurePortWake extends DurableObject<CloudflareBindings> {
    private pending = Promise.resolve();

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
