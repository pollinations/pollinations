import { Agent } from "agents";
import { createMusicianBookingAgent } from "../../agent.js";
import { handleBeeRequest } from "../../runtime/index.js";
import type { SqlStorageLike } from "./sql-store.js";
import { CloudflareSqlBookingStore } from "./sql-store.js";

type AgentContextLike = {
    storage: { sql: SqlStorageLike };
};

export class MusicianBookingCloudflareAgent extends Agent {
    private bookingAgent?: ReturnType<typeof createMusicianBookingAgent>;

    onStart(): void {
        const ctx = (this as unknown as { ctx: AgentContextLike }).ctx;
        this.bookingAgent = createMusicianBookingAgent(
            new CloudflareSqlBookingStore(ctx.storage.sql),
        );
    }

    async onRequest(request: Request): Promise<Response> {
        if (!this.bookingAgent) this.onStart();
        return handleBeeRequest(request, {
            agent: this.bookingAgent,
        });
    }
}
