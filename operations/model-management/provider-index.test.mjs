import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PROVIDER_INDEX_URL, providerIndex } from "./provider-index.mjs";

const inventory = [{ name: "acme/model-4", aliases: ["alias"] }];
const source = (data) => {
    const text = JSON.stringify({ data });
    return {
        id: "s1",
        status: "fetched",
        url: PROVIDER_INDEX_URL,
        fullPage: true,
        text,
        pageDigest: createHash("sha256").update(text).digest("hex"),
        fetchedAt: "2026-10-14T00:00:00Z",
    };
};
test("free provider metadata yields exact official checkpoint hints with prices and TPS, without route recommendations", () => {
    const result = providerIndex(
        source([
            {
                id: "Acme/Model-4",
                providers: [
                    {
                        provider: "niche-host",
                        status: "live",
                        pricing: { input: 0, output: 2 },
                        throughput: 140,
                        context_length: 32000,
                        is_free: true,
                    },
                ],
            },
            {
                id: "acme/model-4-fast",
                providers: [{ provider: "niche-host", status: "live" }],
            },
        ]),
        inventory,
    );
    assert.equal(result.officialMatches, 1);
    assert.deepEqual(result.providers[0].modelNames, [inventory[0].name]);
    assert.deepEqual(result.models[1].officialNames, []);
    assert.equal(result.models[0].providers[0].input, 0);
    assert.equal(result.models[0].providers[0].promotion, true);
    assert.equal(result.models[0].providers[0].throughput, 140);
    assert.equal(result.models[1].providers[0].input, null);
    assert.match(result.scope, /not primary route verification/);
    assert.equal(result.recommendation, undefined);
});
test("error routes, malformed IDs, unsafe query names and invalid prices cannot become provider hints", () => {
    const result = providerIndex(
        source([
            {
                id: "acme/model-4",
                providers: [
                    { provider: "error-host", status: "error" },
                    { provider: 'inject" instruction', status: "live" },
                    {
                        provider: "valid-host",
                        status: "live",
                        pricing: { input: -2, output: "0.5" },
                        throughput: Infinity,
                    },
                ],
            },
            {
                id: "acme/model-4<script>",
                providers: [{ provider: "other-host", status: "live" }],
            },
        ]),
        inventory,
    );
    assert.deepEqual(
        result.providers.map(({ name }) => name),
        ["valid-host"],
    );
    assert.equal(result.models[0].providers[0].input, null);
    assert.equal(result.models[0].providers[0].output, null);
    assert.equal(result.models[0].providers[0].throughput, null);
});
test("truncated, tampered and foreign documents fail closed before metadata extraction", () => {
    const valid = source([]);
    assert.throws(() =>
        providerIndex({ ...valid, fullPage: false }, inventory),
    );
    assert.throws(() =>
        providerIndex({ ...valid, pageDigest: "0".repeat(64) }, inventory),
    );
    assert.throws(() =>
        providerIndex(
            { ...valid, url: "https://blog.example/prices" },
            inventory,
        ),
    );
    assert.throws(() => providerIndex(source({ data: [] }), inventory));
});
