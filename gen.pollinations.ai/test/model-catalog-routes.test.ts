import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import worker from "../src/index.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        {
            ENVIRONMENT: "test",
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
        } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

afterEach(() => {
    vi.restoreAllMocks();
});

test("keeps unfiltered discovery unchanged and skips the health service", async () => {
    const upstream = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("health must not be fetched"));

    const response = await fetchWorker("/v1/models");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        data: Record<string, unknown>[];
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((entry) => !("health" in entry))).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
});

test("supports source filters through queries and persistent client headers", async () => {
    const officialResponse = await fetchWorker("/v1/models?source=official");
    const communityResponse = await fetchWorker("/v1/models", {
        headers: { "X-Pollinations-Model-Source": "community" },
    });

    expect(officialResponse.status).toBe(200);
    expect(communityResponse.status).toBe(200);
    const official = (await officialResponse.json()) as {
        data: { community: boolean }[];
    };
    const community = (await communityResponse.json()) as {
        data: { community: boolean }[];
    };
    expect(official.data.length).toBeGreaterThan(0);
    expect(official.data.every((entry) => !entry.community)).toBe(true);
    expect(community.data.every((entry) => entry.community)).toBe(true);

    expect((await fetchWorker("/models?source=trusted")).status).toBe(400);
    expect(
        (
            await fetchWorker("/models", {
                headers: { "X-Pollinations-Model-Source": "trusted" },
            })
        ).status,
    ).toBe(400);
});

test("exposes health and filters reliable models on the OpenAI list", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
            data: [
                {
                    model: "openai/gpt-5-nano",
                    event_type: "generate.text",
                    status_2xx: 9,
                    errors_5xx: 1,
                },
            ],
        }),
    );

    const allResponse = await fetchWorker(
        "/v1/models?source=official&reliability=all",
    );
    expect(allResponse.status).toBe(200);
    const all = (await allResponse.json()) as {
        data: {
            id: string;
            health: {
                success_rate: number | null;
                sample_count: number;
            };
        }[];
    };
    expect(
        all.data.find(({ id }) => id === "openai/gpt-5-nano")?.health,
    ).toMatchObject({ success_rate: 0.9, sample_count: 10 });

    const reliableResponse = await fetchWorker("/v1/models", {
        headers: {
            "X-Pollinations-Model-Source": "official",
            "X-Pollinations-Model-Reliability": "reliable",
        },
    });
    expect(reliableResponse.status).toBe(200);
    const reliable = (await reliableResponse.json()) as {
        data: { id: string }[];
    };
    expect(reliable.data.map(({ id }) => id)).toEqual(["openai/gpt-5-nano"]);
    expect(upstream).toHaveBeenCalledTimes(1);
});
