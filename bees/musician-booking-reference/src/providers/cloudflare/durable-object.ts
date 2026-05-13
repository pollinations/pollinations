import { createMusicianBookingAgent } from "../../agent.js";
import { handleBeeRequest } from "../../runtime/index.js";
import type { SqlStorageLike } from "./sql-store.js";
import { CloudflareSqlBookingStore } from "./sql-store.js";

type DurableObjectStateLike = {
    storage: { sql: SqlStorageLike };
};

export class MusicianBookingBeeDurableObject {
    private readonly agent;

    constructor(ctx: DurableObjectStateLike) {
        this.agent = createMusicianBookingAgent(
            new CloudflareSqlBookingStore(ctx.storage.sql),
        );
    }

    fetch(request: Request): Promise<Response> {
        return handleBeeRequest(request, { agent: this.agent });
    }
}
