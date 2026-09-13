import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const expected = {
    "community/pollinations-router/floret": {
        input: ["text", "image", "audio", "video"],
        output: ["text", "image", "audio", "video"],
    },
    "community/pollinations-router/polli": {
        input: ["text", "image"],
        output: ["text"],
    },
};

// Gen caches its registry for 60 seconds. Wait for the updated rows to appear.
for (let attempt = 0; ; attempt++) {
    try {
        for (const path of ["/models", "/v1/models"]) {
            const response = await fetch(`https://gen.pollinations.ai${path}`, {
                signal: AbortSignal.timeout(15_000),
            });
            assert.ok(response.ok, `${path}: HTTP ${response.status}`);
            const body = await response.json();
            const models = Array.isArray(body) ? body : body.data;
            for (const [id, modalities] of Object.entries(expected)) {
                const model = models.find(
                    (model) => (model.name ?? model.id) === id,
                );
                assert.ok(model, `${id} missing from ${path}`);
                assert.equal(model.agent, true, `${id} is not an agent`);
                assert.deepEqual(
                    new Set(model.input_modalities),
                    new Set(modalities.input),
                );
                assert.deepEqual(
                    new Set(model.output_modalities),
                    new Set(modalities.output),
                );
                assert.ok(
                    model.supported_endpoints.includes("/v1/chat/completions"),
                );
            }
        }
        console.log(
            "Floret and Polli agent modalities verified in both catalogs.",
        );
        break;
    } catch (error) {
        if (attempt >= 6) throw error;
        console.log(`Waiting for agent catalog refresh: ${error.message}`);
        await setTimeout(15_000);
    }
}
