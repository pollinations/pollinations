import assert from "node:assert/strict";
import test from "node:test";
import { loadPrivateReconciliation } from "./private-config.mjs";

const reconciliation = {
    providerCheckExplanations: [],
    meterDriftExplanations: [],
    pollenWitnessExplanations: [],
};

test("loads one authenticated private reconciliation config", async () => {
    let request;
    const actual = await loadPrivateReconciliation({
        token: "private-read-token",
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                json: async () => ({
                    data: [{ config: JSON.stringify({ reconciliation }) }],
                }),
            };
        },
    });

    assert.deepEqual(actual, reconciliation);
    assert.match(request.url, /economics_private_config_api\.json$/);
    assert.equal(
        request.options.headers.Authorization,
        "Bearer private-read-token",
    );
});

test("requires an explicit private read token", async () => {
    await assert.rejects(
        loadPrivateReconciliation({ token: "", fetchImpl: async () => {} }),
        /TINYBIRD_ECONOMICS_READ_TOKEN is required/,
    );
});

test("rejects an empty private config endpoint", async () => {
    await assert.rejects(
        loadPrivateReconciliation({
            token: "private-read-token",
            fetchImpl: async () => ({
                ok: true,
                json: async () => ({ data: [] }),
            }),
        }),
        /expected one row, received 0/,
    );
});

test("rejects incomplete private reconciliation config", async () => {
    await assert.rejects(
        loadPrivateReconciliation({
            token: "private-read-token",
            fetchImpl: async () => ({
                ok: true,
                json: async () => ({
                    data: [{ config: JSON.stringify({ reconciliation: {} }) }],
                }),
            }),
        }),
        /reconciliation config is incomplete/,
    );
});
