import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { imageProbeRequest, nextImageOperation } from "./image-probe.mjs";

const model = { name: "owner/image", input_modalities: ["text", "image"] };

test("CLI rejects invalid operation flags before any catalog or probe request", () => {
    for (const args of [
        ["--operation", "edit"],
        ["--model", model.name, "--operation"],
        ["--model", model.name, "--operation", "unknown"],
    ]) {
        const result = spawnSync(
            process.execPath,
            [new URL("./probe.mjs", import.meta.url).pathname, ...args],
            {
                env: {
                    ...process.env,
                    POLLI_TOKEN: "local-validation-only",
                    POLLINATIONS_GEN_URL: "invalid-url",
                },
                encoding: "utf8",
            },
        );
        assert.equal(result.status, 1);
        assert.match(
            result.stderr,
            /--operation requires --model and must be generate or edit/,
        );
    }
});

test("alternates advertised edits with generation without adding requests", () => {
    assert.equal(nextImageOperation(model), "edit");
    assert.equal(nextImageOperation(model, "generate"), "edit");
    assert.equal(nextImageOperation(model, "edit"), "generate");
    for (const input_modalities of [undefined, ["text"]]) {
        assert.equal(nextImageOperation({ input_modalities }), "generate");
        assert.equal(
            nextImageOperation({ input_modalities }, "edit"),
            "generate",
        );
    }
});

test("generation keeps the unique marker, default size, and one-image limit", () => {
    const request = imageProbeRequest(model, "fresh-marker", "generate");
    assert.equal(request.requestPath, "/v1/images/generations");
    assert.deepEqual(request.body, {
        model: model.name,
        prompt: "A plain test card labeled fresh-marker",
        n: 1,
        response_format: "b64_json",
    });
});

test("edits use a complete 512px RGB PNG and a cache-busted edit instruction", () => {
    const { requestPath, body } = imageProbeRequest(
        model,
        "fresh-marker",
        "edit",
    );
    assert.equal(requestPath, "/v1/images/edits");
    assert.equal(body.model, model.name);
    assert.equal(body.n, 1);
    assert.match(body.prompt, /Change the black square to blue.*fresh-marker/);
    assert.equal(body.size, undefined);
    assert.match(body.image, /^data:image\/png;base64,/);
    const png = Buffer.from(body.image.split(",")[1], "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[24], 8); // bit depth
    assert.equal(png[25], 2); // RGB
    const idatLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatLength));
    assert.equal(pixels.length, 512 * (512 * 3 + 1));
    assert.equal(png.subarray(-8, -4).toString(), "IEND");
});
