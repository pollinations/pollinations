import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    __resetLatencyStateForTests,
    chooseWeightedServer,
    fetchFromWeightedServer,
    getRegisteredServers,
    recordLatency,
    registerServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";

// Minimal in-memory KV stub matching the subset of KVNamespace we use.
function makeKv() {
    const store = new Map<string, string>();
    return {
        store,
        async get(key: string, _type?: "json") {
            const raw = store.get(key);
            if (raw === undefined) return null;
            return JSON.parse(raw);
        },
        async put(key: string, value: string) {
            store.set(key, value);
        },
        async list({ prefix }: { prefix: string }) {
            const keys = [...store.keys()]
                .filter((k) => k.startsWith(prefix))
                .map((name) => ({ name }));
            return { keys };
        },
        async delete(key: string) {
            store.delete(key);
        },
    } as unknown as KVNamespace;
}

describe("chooseWeightedServer", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the only server when there is one", () => {
        const url = chooseWeightedServer([
            { url: "https://a", lastHeartbeat: 0 },
        ]);
        expect(url).toBe("https://a");
    });

    it("favours the faster (lower lastMs) server", () => {
        // Fast lastMs=1000 (weight 1.0), slow lastMs=5000 (weight 0.2).
        const servers = [
            { url: "https://fast", lastHeartbeat: 0, lastMs: 1000 },
            { url: "https://slow", lastHeartbeat: 0, lastMs: 5000 },
        ];
        const picks = { fast: 0, slow: 0 };
        // Deterministic sweep across [0,1) instead of real randomness.
        let i = 0;
        vi.spyOn(Math, "random").mockImplementation(() => {
            const v = i / 100;
            i = (i + 1) % 100;
            return v;
        });
        for (let n = 0; n < 100; n++) {
            if (chooseWeightedServer(servers) === "https://fast") picks.fast++;
            else picks.slow++;
        }
        // weight ratio 1.0 : 0.2 => fast should get ~5x the slow server's share.
        expect(picks.fast).toBeGreaterThan(picks.slow * 3);
    });

    it("gives unmeasured servers a neutral (non-zero) share so they get sampled", () => {
        const servers = [
            { url: "https://measured", lastHeartbeat: 0, lastMs: 1000 },
            { url: "https://new", lastHeartbeat: 0 },
        ];
        let i = 0;
        vi.spyOn(Math, "random").mockImplementation(() => {
            const v = i / 100;
            i = (i + 1) % 100;
            return v;
        });
        const seen = new Set<string>();
        for (let n = 0; n < 100; n++) seen.add(chooseWeightedServer(servers));
        // The new, unmeasured server must still be reachable (not starved).
        expect(seen.has("https://new")).toBe(true);
    });
});

describe("fetchFromWeightedServer", () => {
    beforeEach(() => {
        setServerRegistryBinding(makeKv(), "test");
        __resetLatencyStateForTests();
        vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("retries a distinct worker when the selected worker returns 503", async () => {
        await registerServer("https://w1", "flux");
        await registerServer("https://w2", "flux");
        const calls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = input.toString();
            calls.push(url);
            return url.startsWith("https://w1/")
                ? new Response("queue full", { status: 503 })
                : new Response("image", { status: 200 });
        });

        const response = await fetchFromWeightedServer("flux", {
            method: "POST",
            body: "request-body",
        });

        expect(response.status).toBe(200);
        expect(calls).toEqual(["https://w1/generate", "https://w2/generate"]);
    });

    it("tries every worker once before returning a terminal 503", async () => {
        await registerServer("https://w1", "flux");
        await registerServer("https://w2", "flux");
        const calls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            calls.push(input.toString());
            return new Response("queue full", { status: 503 });
        });

        await expect(
            fetchFromWeightedServer("flux", { method: "POST" }),
        ).rejects.toMatchObject({
            status: 503,
            upstreamUrl: "https://w2/generate",
        });
        expect(calls).toEqual(["https://w1/generate", "https://w2/generate"]);
    });

    it("does not retry failures other than queue-full 503", async () => {
        await registerServer("https://w1", "flux");
        await registerServer("https://w2", "flux");
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("CUDA error", { status: 500 }));

        await expect(
            fetchFromWeightedServer("flux", { method: "POST" }),
        ).rejects.toMatchObject({ status: 500 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("recordLatency", () => {
    beforeEach(() => {
        setServerRegistryBinding(makeKv(), "test");
        __resetLatencyStateForTests();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("stores the last latency on the server entry", async () => {
        await registerServer("https://w1", "zimage");
        await recordLatency("zimage", "https://w1", 2000);
        const w1 = (await getRegisteredServers("zimage")).find(
            (s) => s.url === "https://w1",
        );
        expect(w1?.lastMs).toBe(2000);
    });

    it("throttles repeated writes (keeps the first, ignores the immediate second)", async () => {
        await registerServer("https://w1", "zimage");
        await recordLatency("zimage", "https://w1", 2000);
        await recordLatency("zimage", "https://w1", 9000); // within throttle window
        const w1 = (await getRegisteredServers("zimage")).find(
            (s) => s.url === "https://w1",
        );
        expect(w1?.lastMs).toBe(2000);
    });

    it("does not surface a server that only has a latency key (no heartbeat)", async () => {
        await recordLatency("zimage", "https://ghost", 1234);
        const servers = await getRegisteredServers("zimage");
        expect(servers).toHaveLength(0);
    });

    it("keeps lastMs when a later heartbeat re-registers the server", async () => {
        // The bug this fix addresses: a heartbeat must never wipe the routing
        // weight. Latency and heartbeat live under separate keys, so a fresh
        // registerServer cannot drop lastMs.
        await registerServer("https://w1", "zimage");
        await recordLatency("zimage", "https://w1", 2000);
        // Simulate the next heartbeat (past the 30s heartbeat throttle).
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
        await registerServer("https://w1", "zimage");
        const w1 = (await getRegisteredServers("zimage")).find(
            (s) => s.url === "https://w1",
        );
        expect(w1?.lastMs).toBe(2000);
    });

    it("ignores invalid latency values (0, negative, NaN)", async () => {
        await registerServer("https://w1", "zimage");
        for (const bad of [0, -5, Number.NaN]) {
            await recordLatency("zimage", "https://w1", bad);
        }
        const w1 = (await getRegisteredServers("zimage")).find(
            (s) => s.url === "https://w1",
        );
        expect(w1?.lastMs).toBeUndefined();
    });

    it("records a new latency once the throttle window has passed", async () => {
        await registerServer("https://w1", "zimage");
        await recordLatency("zimage", "https://w1", 2000);
        // Advance time past the 20s throttle window.
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 21_000);
        await recordLatency("zimage", "https://w1", 3500);
        const w1 = (await getRegisteredServers("zimage")).find(
            (s) => s.url === "https://w1",
        );
        expect(w1?.lastMs).toBe(3500);
    });
});
