import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchFromLeastBusyServer,
    setServerRegistryBinding,
} from "../../src/image/availableServers.ts";
import type { HttpError } from "../../src/image/httpError.ts";

function createKv(url: string): KVNamespace {
    return {
        list: vi.fn().mockResolvedValue({ keys: [{ name: "server" }] }),
        get: vi.fn().mockResolvedValue({ url, lastHeartbeat: Date.now() }),
    } as unknown as KVNamespace;
}

describe("fetchFromLeastBusyServer", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("preserves upstream 4xx diagnostics for public error mapping", async () => {
        setServerRegistryBinding(createKv("https://zimage.example"), "test");
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        detail: [
                            {
                                msg: "Input should be greater than or equal to 256",
                            },
                        ],
                    }),
                    { status: 422 },
                ),
            ),
        );

        await expect(
            fetchFromLeastBusyServer("zimage", {
                method: "POST",
                body: JSON.stringify({ width: 280, height: 220 }),
            }),
        ).rejects.toMatchObject({
            name: "HttpError",
            status: 422,
            details: {
                body: expect.stringContaining("greater than or equal to 256"),
            },
            upstreamUrl: "https://zimage.example/generate",
        } satisfies Partial<HttpError>);
    });
});
