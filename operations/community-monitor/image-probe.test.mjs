import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import {
    imageProbeRequest,
    imageProbeResult,
    nextImageOperation,
} from "./image-probe.mjs";

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

test("attributes a successful edit to the served model, not the requested one", () => {
    const image = imageProbeRequest(model, "marker", "edit").body.image.split(
        ",",
    )[1];
    const body = JSON.stringify({ data: [{ b64_json: image }] });
    for (const served of [model.name, "owner/fallback-image", null]) {
        const result = imageProbeResult(
            new Response(body, {
                headers: served ? { "x-model-used": served } : {},
            }),
            body,
            model.name,
        );
        assert.equal(result.ok, true); // A fallback rescue is still success.
        assert.equal(result.modelUsed, served);
        assert.equal(
            result.fallbackUsed,
            served ? served !== model.name : null,
        );
    }
});

test("keeps upstream 400 diagnostics without classifying all 4xx as outages", () => {
    for (const [status, error, upstreamStatus] of [
        [
            400,
            {
                message:
                    "Community image endpoint responded 400: Missing model parameter",
                code: "BAD_REQUEST",
                details: {
                    upstreamStatus: 400,
                    upstreamBody: "private upstream body",
                },
            },
            400,
        ],
        [
            500,
            {
                message:
                    "Community image endpoint responded 500: Image edit failed",
                details: { upstreamStatus: 500 },
            },
            500,
        ],
        [
            402,
            { message: "Insufficient pollen", code: "PAYMENT_REQUIRED" },
            null,
        ],
        [400, { message: "Invalid image", code: "invalid_image_url" }, null],
        [
            400,
            {
                message: "Image rejected",
                code: "content_policy_violation",
                details: { upstreamStatus: 400 },
            },
            400,
        ],
    ]) {
        const body = JSON.stringify({ error });
        const result = imageProbeResult(
            new Response(body, { status }),
            body,
            model.name,
        );
        assert.equal(result.ok, false);
        assert.equal(result.upstreamStatus, upstreamStatus);
        assert.equal(result.errorCode, error.code ?? null);
        assert.equal(result.detail, error.message);
        assert.equal(
            JSON.stringify(result).includes("private upstream body"),
            false,
        );
    }
});

test("invalid image bodies remain failures even when a fallback answered 200", () => {
    for (const body of [
        "not json",
        "null",
        '{"data":[]}',
        '{"data":[{"b64_json":"dGlueQ=="}]}',
    ]) {
        const result = imageProbeResult(
            new Response(body, {
                headers: { "x-model-used": "owner/fallback-image" },
            }),
            body,
            model.name,
        );
        assert.equal(result.ok, false);
        assert.equal(result.status, "INVALID");
        assert.equal(result.fallbackUsed, true);
    }
});
