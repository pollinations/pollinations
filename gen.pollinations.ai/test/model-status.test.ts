import { afterEach, describe, expect, it, vi } from "vitest";
import { modelStatusRoutes } from "../src/routes/model-status.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function toUrl(input: Parameters<typeof fetch>[0]): URL {
    if (input instanceof Request) return new URL(input.url);
    return new URL(String(input));
}

describe("model status route", () => {
    it("proxies raw Tinybird responses and caches by minutes", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                const url = toUrl(input);
                const minutes = url.searchParams.get("minutes");
                return Response.json({
                    data: [{ model: `window-${minutes}` }],
                    meta: [{ name: "model", type: "String" }],
                });
            });

        const fiveMinuteResponse = await modelStatusRoutes.request(
            "/v1/models/status?minutes=5",
        );
        const sixtyMinuteResponse = await modelStatusRoutes.request(
            "/v1/models/status?minutes=60",
        );
        const cachedFiveMinuteResponse = await modelStatusRoutes.request(
            "/v1/models/status?minutes=5",
        );

        expect(fiveMinuteResponse.status).toBe(200);
        expect(sixtyMinuteResponse.status).toBe(200);
        expect(cachedFiveMinuteResponse.status).toBe(200);
        expect(await fiveMinuteResponse.json()).toMatchObject({
            data: [{ model: "window-5" }],
        });
        expect(await sixtyMinuteResponse.json()).toMatchObject({
            data: [{ model: "window-60" }],
        });
        expect(await cachedFiveMinuteResponse.json()).toMatchObject({
            data: [{ model: "window-5" }],
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(
            toUrl(fetchMock.mock.calls[0][0]).searchParams.get("minutes"),
        ).toBe("5");
        expect(
            toUrl(fetchMock.mock.calls[1][0]).searchParams.get("minutes"),
        ).toBe("60");
    });

    it("rejects unsupported query params before calling Tinybird", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        const invalidMinutesResponse = await modelStatusRoutes.request(
            "/v1/models/status?minutes=0",
        );
        const transformedFormatResponse = await modelStatusRoutes.request(
            "/v1/models/status?format=json",
        );

        expect(invalidMinutesResponse.status).toBe(400);
        expect(transformedFormatResponse.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
