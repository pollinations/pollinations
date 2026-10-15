import { readResponseBytes, readResponseText } from "@shared/response-bytes.ts";
import { describe, expect, it } from "vitest";

const tooLarge = (total: number) => new Error(`Too large: ${total}`);

function streamed(chunks: Uint8Array[], contentLength?: string): Response {
    let index = 0;
    return new Response(
        new ReadableStream({
            pull(controller) {
                if (index < chunks.length) controller.enqueue(chunks[index++]);
                else controller.close();
            },
        }),
        {
            headers:
                contentLength === undefined
                    ? {}
                    : { "content-length": contentLength },
        },
    );
}

describe("bounded response reader", () => {
    it.each([
        undefined,
        "4",
        "1",
        "invalid",
    ])("accepts the exact cap with content-length %s", async (length) => {
        const bytes = await readResponseBytes(
            streamed([new Uint8Array([1, 2]), new Uint8Array([3, 4])], length),
            4,
            tooLarge,
        );
        expect([...bytes]).toEqual([1, 2, 3, 4]);
        expect(bytes.byteLength).toBe(4);
        expect(bytes.buffer.byteLength).toBe(4);
    });

    it.each([
        undefined,
        "5",
        "1",
        "invalid",
    ])("rejects over the cap with content-length %s", async (length) => {
        await expect(
            readResponseBytes(
                streamed(
                    [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])],
                    length,
                ),
                4,
                tooLarge,
            ),
        ).rejects.toThrow("Too large: 5");
    });

    it("returns only received bytes when the declared size is larger", async () => {
        const bytes = await readResponseBytes(
            streamed([new Uint8Array([7, 8])], "4"),
            4,
            tooLarge,
        );
        expect([...bytes]).toEqual([7, 8]);
        expect(bytes.byteLength).toBe(2);
        expect(bytes.buffer.byteLength).toBe(2);
    });

    it("does not retain a doubled allocation for unknown-length video", async () => {
        const size = 33 * 1024 * 1024;
        const chunks = Array.from(
            { length: 33 },
            () => new Uint8Array(1024 * 1024),
        );
        const bytes = await readResponseBytes(
            streamed(chunks),
            64 * 1024 * 1024,
            tooLarge,
        );
        expect(bytes.byteLength).toBe(size);
        expect(bytes.buffer.byteLength).toBe(size);
    });

    it("cancels an oversized stream instead of downloading the rest", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                pull(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );
        await expect(readResponseBytes(response, 2, tooLarge)).rejects.toThrow(
            "Too large: 3",
        );
        expect(cancelled).toBe(true);
    });

    it("decodes UTF-8 split across chunks and accepts an empty body", async () => {
        expect(
            await readResponseText(
                streamed([
                    new Uint8Array([0xe2]),
                    new Uint8Array([0x82, 0xac]),
                ]),
                3,
                tooLarge,
            ),
        ).toBe("€");
        expect(
            await readResponseBytes(new Response(null), 0, tooLarge),
        ).toHaveLength(0);
    });

    it("accepts a 64 MiB streamed body at the limit", async () => {
        const size = 64 * 1024 * 1024;
        let sent = 0;
        const response = new Response(
            new ReadableStream({
                pull(controller) {
                    if (sent === size) return controller.close();
                    const chunk = new Uint8Array(
                        Math.min(64 * 1024, size - sent),
                    );
                    chunk.fill(33);
                    sent += chunk.length;
                    controller.enqueue(chunk);
                },
            }),
            { headers: { "content-length": String(size) } },
        );
        const bytes = await readResponseBytes(response, size, tooLarge);
        expect(bytes.byteLength).toBe(size);
        expect(bytes[0]).toBe(33);
        expect(bytes[size - 1]).toBe(33);
    });
});
