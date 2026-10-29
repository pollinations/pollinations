import { rateLimit } from "@shared/rate-limit.ts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";

/** Counts calls per key within one window, like the Cloudflare binding. */
function limiter(limit: number): RateLimit {
    const counts = new Map<string, number>();
    return {
        async limit({ key }) {
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            return { success: count <= limit };
        },
    };
}

// Small stand-ins for wrangler's 600 per key and 1,000 per IP.
function bindings() {
    return {
        EDGE_RATE_LIMITER: limiter(3),
        EDGE_IP_RATE_LIMITER: limiter(5),
    };
}

const app = new Hono().use(edgeRateLimit).get("/", (c) => c.text("ok"));

function send(
    env: ReturnType<typeof bindings>,
    { key, ip = "203.0.113.7" }: { key?: string; ip?: string },
) {
    const headers = new Headers({ "CF-Connecting-IP": ip });
    if (key) headers.set("Authorization", `Bearer ${key}`);
    return app.request("/", { headers }, env);
}

describe("edge rate limit", () => {
    it("caps rotating keys from one IP at the IP limit", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 6; i++) {
            statuses.push((await send(env, { key: `sk_fake${i}` })).status);
        }
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);

        const blocked = await send(env, { key: "sk_fake6" });
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("Retry-After")).toBe("10");
        expect(
            (await send(env, { key: "sk_fake7", ip: "198.51.100.1" })).status,
        ).toBe(200);
    });

    it("caps one key at its own limit across IPs", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            const ip = `198.51.100.${i}`;
            statuses.push((await send(env, { key: "sk_one", ip })).status);
        }
        expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it("caps requests without a key per IP at the key limit", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            statuses.push((await send(env, {})).status);
        }
        expect(statuses).toEqual([200, 200, 200, 429]);
        expect((await send(env, { ip: "198.51.100.1" })).status).toBe(200);
    });
});

// Enter's limiter: keys only, plus unkeyed requests that carry a client IP.
const enterApp = new Hono()
    .use(rateLimit({ byIp: false }))
    .get("/", (c) => c.text("ok"));

describe("enter rate limit", () => {
    it("caps requests without a key per client IP", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            const headers = { "CF-Connecting-IP": "203.0.113.7" };
            statuses.push(
                (await enterApp.request("/", { headers }, env)).status,
            );
        }
        expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it("caps rotating made-up keys from one client IP", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            const headers = {
                "CF-Connecting-IP": "203.0.113.7",
                Authorization: `Bearer sk_fake${i}`,
            };
            statuses.push(
                (await enterApp.request("/", { headers }, env)).status,
            );
        }
        expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it("leaves internal calls without a client IP alone", async () => {
        const env = bindings();
        const statuses = [];
        for (let i = 0; i < 5; i++) {
            const headers = { Authorization: `Bearer sk_internal${i}` };
            statuses.push((await enterApp.request("/", {}, env)).status);
            statuses.push(
                (await enterApp.request("/", { headers }, env)).status,
            );
        }
        expect(statuses).toEqual(Array(10).fill(200));
    });
});
