import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callMeshy71 } from "../../src/model3d/models/meshy71Model.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

const params: Model3dParams = {
    model: "meshy/meshy-7.1",
    resolution: "low",
    image: [],
    safe: false,
    seed: 42,
};
const glb = Buffer.alloc(24);
glb.write("glTF");
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(24, 8);
glb.writeUInt32LE(4, 12);
glb.write("JSON", 16);
glb.write("{}  ", 20);
beforeEach(() =>
    syncModel3dEnvironment({
        ...env,
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings),
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("Meshy 7.1", () => {
    it.each([
        1.5, 3,
    ])("uses provider billing quantity %s and returns validated GLB", async (units) => {
        vi.useFakeTimers();
        const spy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json(
                    { model_glb: { url: "https://example.com/model.glb" } },
                    { headers: { "x-fal-billable-units": String(units) } },
                ),
            )
            .mockResolvedValueOnce(new Response(glb));
        const promise = callMeshy71("a wooden chair", params);
        await vi.advanceTimersByTimeAsync(5000);
        const result = await promise;
        expect(result.buffer).toEqual(glb);
        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(
            units / 1.5,
        );
        expect(spy.mock.calls[0][0]).toBe(
            "https://queue.fal.run/meshy/v7.1/text-to-3d",
        );
        expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toMatchObject({
            mode: "full",
            model_type: "standard",
            target_polycount: 10000,
            should_remesh: true,
            enable_pbr: true,
            seed: 42,
        });
    });
    it.each([
        "",
        "0",
        "NaN",
    ])("rejects missing or invalid billable units %s", async (units) => {
        vi.useFakeTimers();
        const spy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json(
                    { model_glb: { url: "https://example.com/model.glb" } },
                    { headers: { "x-fal-billable-units": units } },
                ),
            );
        const check = expect(callMeshy71("a chair", params)).rejects.toThrow(
            "no billable units",
        );
        await vi.advanceTimersByTimeAsync(5000);
        await check;
        expect(spy).toHaveBeenCalledTimes(3);
    });
    it("does not label non-GLB output as GLB", async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json(
                    { model_glb: { url: "https://example.com/model.fbx" } },
                    { headers: { "x-fal-billable-units": "1.5" } },
                ),
            )
            .mockResolvedValueOnce(new Response("not a GLB"));
        const check = expect(callMeshy71("a chair", params)).rejects.toThrow(
            "invalid GLB",
        );
        await vi.advanceTimersByTimeAsync(5000);
        await check;
    });
    it("rejects empty prompts, long prompts and images before submitting", async () => {
        const spy = vi.spyOn(globalThis, "fetch");
        await expect(callMeshy71(" ", params)).rejects.toBeTruthy();
        await expect(
            callMeshy71("a".repeat(601), params),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            callMeshy71("chair", {
                ...params,
                image: ["https://example.com/a.png"],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(spy).not.toHaveBeenCalled();
    });
});
