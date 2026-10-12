import {
    createExecutionContext,
    env,
    runInDurableObject,
    waitOnExecutionContext,
} from "cloudflare:test";
import worker, { generateCacheKey } from "../src/index.js";

let lastIp = 0;
/** An IP no earlier call used: the IP slots and takeSlot's memo are per IP */
export const nextIp = () => `198.51.100.${++lastIp}`;

/** Calls the Worker as the edge would, reads the body, then waits for its background work */
export async function call(
    path,
    {
        ip = nextIp(),
        host = "text.pollinations.ai",
        method,
        headers,
        body,
        testEnv = env,
        app = worker,
    } = {},
) {
    const ctx = createExecutionContext();
    const request = new Request(`https://${host}${path}`, {
        method,
        body,
        headers: { "cf-connecting-ip": ip, ...headers },
    });
    const response = await app.fetch(request, testEnv, ctx);
    const text = await response.text();
    await waitOnExecutionContext(ctx);
    return { response, text };
}

/** A capture's headers, without the ones the edge adds */
export function capturedHeaders(raw) {
    const edge = ["date", "cf-ray", "cf-cache-status", "server"];
    const lines = raw.trim().split(/\r?\n/).slice(1);
    const pairs = lines.map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()];
    });
    return new Map(pairs.filter(([name]) => !edge.includes(name)));
}

export const storedAt = async (path, method = "GET") =>
    env.TEXT_BUCKET.head(
        await generateCacheKey(
            new Request(`https://text.pollinations.ai${path}`, { method }),
        ),
    );

export const alarmOf = (ip) =>
    runInDurableObject(env.IP_SLOT.getByName(ip), (_slot, state) =>
        state.storage.getAlarm(),
    );
