import {
    createExecutionContext,
    env,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import { MAX_HOLD_MS } from "../../../shared/ip-slot.js";
import { generateCacheKey } from "../src/cache-utils.ts";
import worker from "../src/index.ts";

let lastIp = 0;
/** An IP no earlier call used: the IP slots and takeSlot's memo are per IP */
export const nextIp = () => `198.51.100.${++lastIp}`;

type CallOptions = {
    ip?: string;
    host?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
    testEnv?: Record<string, unknown>;
    app?: typeof worker;
};

/** Calls the Worker as the edge would, reads the body, then waits for its background work */
export async function call(
    path: string,
    {
        ip = nextIp(),
        host = "image.pollinations.ai",
        method,
        headers,
        body,
        testEnv = env,
        app = worker,
    }: CallOptions = {},
) {
    const ctx = createExecutionContext();
    const request = new Request(`https://${host}${path}`, {
        method,
        body,
        headers: { "cf-connecting-ip": ip, ...headers },
    });
    const response = await app.fetch(request, testEnv, ctx);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await waitOnExecutionContext(ctx);
    return { response, bytes, text: new TextDecoder().decode(bytes) };
}

/** A capture's headers, without the ones the edge adds */
export function capturedHeaders(raw: string) {
    const edge = ["date", "cf-ray", "cf-cache-status", "server"];
    const lines = raw.trim().split(/\r?\n/).slice(1);
    const pairs = lines.map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()];
    });
    return new Map(pairs.filter(([name]) => !edge.includes(name)));
}

export const storedAt = (path: string) =>
    env.IMAGE_BUCKET.head(
        generateCacheKey(new URL(`https://image.pollinations.ai${path}`)),
    );

export const alarmOf = (ip: string) =>
    runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.getAlarm(),
    );

/** An IP whose free generation is running, as IpSlot stores it */
export async function limitedIp() {
    const ip = nextIp();
    await runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.setAlarm(Date.now() + MAX_HOLD_MS),
    );
    return ip;
}

/** env with a GEN binding that records the URLs and headers it sends to gen */
export function recordingGen(base = env) {
    const requests: Request[] = [];
    const testEnv = {
        ...base,
        GEN: {
            fetch: (url: URL, init: RequestInit) => {
                requests.push(new Request(url, init));
                return env.GEN.fetch(url, init);
            },
        },
    };
    return { requests, testEnv };
}
