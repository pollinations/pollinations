import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callGenSana } from "../src/createAndReturnImages.ts";
import type { ImageParams } from "../src/params.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEN_API_KEY;
});

describe("callGenSana", () => {
    it("calls Gen with the service key and Sana model", async () => {
        process.env.GEN_API_KEY = "sk_test_service";
        const jpeg1x1 = await sharp({
            create: {
                width: 1,
                height: 1,
                channels: 3,
                background: "white",
            },
        })
            .jpeg()
            .toBuffer();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(jpeg1x1, {
                status: 200,
                headers: { "content-type": "image/jpeg" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const params = {
            width: 512,
            height: 512,
            seed: 42,
            model: "sana",
            safe: false,
            quality: "medium",
            image: [],
            transparent: false,
            private: true,
        } as unknown as ImageParams;

        const result = await callGenSana("a fast flower", params);

        expect(result.buffer.length).toBeGreaterThan(0);
        expect(fetchMock).toHaveBeenCalledOnce();
        const [requestUrl, init] = fetchMock.mock.calls[0] as [
            URL,
            RequestInit,
        ];
        expect(requestUrl.origin).toBe("https://gen.pollinations.ai");
        expect(requestUrl.pathname).toBe("/image/a%20fast%20flower");
        expect(requestUrl.searchParams.get("model")).toBe("sana");
        expect(requestUrl.searchParams.get("width")).toBe("1024");
        expect(requestUrl.searchParams.get("height")).toBe("1024");
        expect(requestUrl.searchParams.get("private")).toBe("true");
        expect(init.headers).toMatchObject({
            Authorization: "Bearer sk_test_service",
        });
    });

    it("fails closed when the service key is missing", async () => {
        const params = {
            width: 512,
            height: 512,
            seed: 42,
            model: "sana",
            safe: false,
        } as unknown as ImageParams;

        await expect(callGenSana("test", params)).rejects.toThrow(
            "GEN_API_KEY is required",
        );
    });
});
