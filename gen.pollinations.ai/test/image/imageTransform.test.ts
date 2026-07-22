import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";
import {
    setImagesBinding,
    transformImage,
} from "../../src/image/utils/imageTransform.ts";

afterEach(() => {
    setImagesBinding(undefined);
});

function bindingWithPipeline(pipeline: object): ImagesBinding {
    return {
        input: vi.fn().mockReturnValue(pipeline),
    } as unknown as ImagesBinding;
}

describe("transformImage", () => {
    it("attributes Images binding output failures", async () => {
        setImagesBinding(
            bindingWithPipeline({
                output: vi
                    .fn()
                    .mockRejectedValue(
                        new TypeError("Network connection lost"),
                    ),
            }),
        );

        const error = await transformImage(Buffer.from("image")).catch(
            (caught) => caught,
        );

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({
            status: 502,
            message: "Cloudflare Images output failed: Network connection lost",
            details: { service: "cloudflare-images", stage: "output" },
            upstreamUrl: "https://images.cloudflare.com/binding",
        });
    });

    it("attributes Images binding response body failures", async () => {
        setImagesBinding(
            bindingWithPipeline({
                output: vi.fn().mockResolvedValue({
                    response: () => ({
                        arrayBuffer: vi
                            .fn()
                            .mockRejectedValue(
                                new TypeError("Network connection lost"),
                            ),
                    }),
                }),
            }),
        );

        await expect(
            transformImage(Buffer.from("image")),
        ).rejects.toMatchObject({
            status: 502,
            message:
                "Cloudflare Images body read failed: Network connection lost",
            details: {
                service: "cloudflare-images",
                stage: "body read",
            },
            upstreamUrl: "https://images.cloudflare.com/binding",
        });
    });
});
