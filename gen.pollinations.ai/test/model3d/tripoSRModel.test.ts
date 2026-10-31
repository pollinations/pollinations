import { Buffer } from "node:buffer";
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { mediaHeaders } from "../../src/model3d/handler.ts";
import { callTripoSR } from "../../src/model3d/models/tripoSRModel.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

const reference = "https://example.com/reference.png";
const params = (image: string[] = [reference]): Model3dParams => ({
    model: "stability-ai/triposr",
    resolution: "low",
    image,
    safe: false,
});

function validGlb(): Buffer {
    const data = Buffer.alloc(24);
    data.write("glTF");
    data.writeUInt32LE(2, 4);
    data.writeUInt32LE(24, 8);
    data.writeUInt32LE(4, 12);
    data.write("JSON", 16);
    data.write("{}  ", 20);
    return data;
}

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => vi.restoreAllMocks());

describe("callTripoSR", () => {
    it("submits a single image without prompt/resolution and returns a valid GLB", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({ job_id: "job_trip" }, { status: 202 }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    status: "completed",
                    data: [{ model_glb_b64_bytes: validGlb().toString("base64") }],
                    usage: { payg_credits_charged: 0.07 },
                }),
            );

        const result = await callTripoSR(params());
        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.buffer).toEqual(validGlb());

        const submit = fetchSpy.mock.calls[0];
        expect(submit[0]).toBe("https://api.inferenceport.ai/v1/3d/generations");
        expect(JSON.parse((submit[1] as RequestInit).body as string)).toEqual({
            model: "tripoSR",
            image_urls: [reference],
        });
        expect(new Headers((submit[1] as RequestInit).headers).get("Authorization")).toBe(
            "Bearer ip_test_token",
        );
        expect(fetchSpy.mock.calls[1][0]).toBe(
            "https://api.inferenceport.ai/v1/3d/jobs/job_trip",
        );

        const headers = mediaHeaders("", params(), result);
        expect(headers.get("Content-Type")).toBe("model/gltf-binary");
        expect(headers.get("Content-Disposition")).toContain(".glb");
        expect(headers.get("x-usage-provider-billable-units")).toBe("0.07");
        expect(headers.get("x-usage-completion-image-tokens")).toBe("1");
    });

    it("forwards a valid base64 image data URI unchanged", async () => {
        const dataUri = "data:image/png;base64,aGVsbG8=";
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(Response.json({ job_id: "job_uri" }, { status: 202 }))
            .mockResolvedValueOnce(Response.json({
                status: "completed",
                data: [{ model_glb_b64_bytes: validGlb().toString("base64") }],
            }));
        await callTripoSR(params([dataUri]));
        expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string))
            .toMatchObject({ image_urls: [dataUri] });
    });

    it.each([[], [reference, "https://example.com/second.png"]])(
        "requires exactly one reference image: %j",
        async (images) => {
            const fetchSpy = vi.spyOn(globalThis, "fetch");
            await expect(callTripoSR(params(images))).rejects.toMatchObject({
                status: 400,
            });
            expect(fetchSpy).not.toHaveBeenCalled();
        },
    );

    it("rejects malformed GLB output instead of returning corrupt assets", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(Response.json({ job_id: "job_bad" }, { status: 202 }))
            .mockResolvedValueOnce(Response.json({
                status: "completed",
                data: [{ model_glb_b64_bytes: Buffer.from("bad").toString("base64") }],
            }));
        await expect(callTripoSR(params())).rejects.toThrow("invalid GLB");
    });
});
