import { createMusicianBookingAgent } from "../../agent.js";
import { handleBeeRequest } from "../../runtime/index.js";
import { MusicianBookingBeeDurableObject } from "./durable-object.js";

export { MusicianBookingBeeDurableObject };

type DurableObjectStubLike = {
    fetch(request: Request): Promise<Response>;
};

type DurableObjectIdLike = unknown;

type DurableObjectNamespaceLike = {
    idFromName(name: string): DurableObjectIdLike;
    get(id: DurableObjectIdLike): DurableObjectStubLike;
};

type CloudflareEnv = {
    MUSICIAN_BOOKING_BEE?: DurableObjectNamespaceLike;
};

const fallbackAgent = createMusicianBookingAgent();

function objectName(request: Request): string {
    const url = new URL(request.url);
    const explicit =
        url.searchParams.get("user_id") ??
        request.headers.get("x-pollinations-user-id");
    return explicit ?? "anonymous";
}

export default {
    fetch(request: Request, env: CloudflareEnv): Promise<Response> {
        if (!env.MUSICIAN_BOOKING_BEE) {
            return handleBeeRequest(request, { agent: fallbackAgent });
        }
        const id = env.MUSICIAN_BOOKING_BEE.idFromName(objectName(request));
        return env.MUSICIAN_BOOKING_BEE.get(id).fetch(request);
    },
};
