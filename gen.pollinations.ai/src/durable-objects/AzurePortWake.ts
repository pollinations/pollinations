import { DurableObject } from "cloudflare:workers";
import { type SharedPort, wakePort } from "../routes/e2b.ts";

export class AzurePortWake extends DurableObject<CloudflareBindings> {
    private pending = Promise.resolve();

    // Lease billing reads the sandbox state before connecting. Serialize
    // wakes across ports and edge locations so the next request sees the paid lease.
    wake(share: SharedPort) {
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
