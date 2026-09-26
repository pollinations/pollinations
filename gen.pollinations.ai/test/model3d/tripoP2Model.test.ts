import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTripoP2 } from "../../src/model3d/models/tripoP2Model.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

const params: Model3dParams = {
    model: "tripo3d/p2",
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

describe("Tripo P2", () => {
    it.each([
        110, 220,
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
                    { model_mesh: { url: "https://example.com/model.glb" } },
                    { headers: { "x-fal-billable-units": String(units) } },
                ),
            )
            .mockResolvedValueOnce(new Response(glb));
        const promise = callTripoP2("a wooden chair", params);
        await vi.advanceTimersByTimeAsync(5000);
        const result = await promise;
        expect(result.buffer).toEqual(glb);
        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.trackingData?.usage?.completionImageTokens).toBe(
            units / 110,
        );
        expect(spy.mock.calls[0][0]).toBe(
            "https://queue.fal.run/tripo3d/p2/text-to-3d",
        );
        expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toMatchObject({
            face_limit: 10000,
            pbr: true,
            texture_version: "v3.5-20260815",
            image_seed: 42,
            model_seed: 42,
            texture_seed: 42,
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
                    { model_mesh: { url: "https://example.com/model.glb" } },
                    { headers: { "x-fal-billable-units": units } },
                ),
            );
        const check = expect(callTripoP2("a chair", params)).rejects.toThrow(
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
                    { model_mesh: { url: "https://example.com/model.fbx" } },
                    { headers: { "x-fal-billable-units": "110" } },
                ),
            )
            .mockResolvedValueOnce(new Response("not a GLB"));
        const check = expect(callTripoP2("a chair", params)).rejects.toThrow(
            "invalid GLB",
        );
        await vi.advanceTimersByTimeAsync(5000);
        await check;
    });
    it("rejects empty prompts, long prompts and images before submitting", async () => {
        const spy = vi.spyOn(globalThis, "fetch");
        await expect(callTripoP2(" ", params)).rejects.toBeTruthy();
        await expect(
            callTripoP2("a".repeat(1025), params),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            callTripoP2("chair", {
                ...params,
                image: ["https://example.com/a.png"],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(spy).not.toHaveBeenCalled();
    });
});
