import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, validateOptillmRequest } from "./request.js";

test("accepts only bounded fields for the selected approach", () => {
    assert.equal(
        validateOptillmRequest({
            optillm_approach: "mcts",
            mcts_simulations: 3,
            mcts_depth: 2,
            mcts_exploration: 0.4,
        }),
        null,
    );
    assert.equal(
        validateOptillmRequest({ optillm_approach: "re2", best_of_n: 5 }),
        "best_of_n is not valid for re2",
    );
    assert.equal(
        validateOptillmRequest({
            optillm_approach: "mcts",
            mcts_simulations: 100,
        }),
        "mcts_simulations is outside the supported range",
    );
    assert.equal(
        validateOptillmRequest({
            optillm_approach: "cepo",
            cepo_bestofn_n: 20,
        }),
        "Unsupported OptiLLM approach",
    );
});

test("requires an agent run token before forwarding", async () => {
    let forwarded = false;
    const containerFor = () => ({
        fetch: async () => {
            forwarded = true;
            return new Response("ok");
        },
    });
    const unauthorized = await handleRequest(
        new Request("https://optillm.test/v1/chat/completions", {
            method: "POST",
            body: JSON.stringify({ optillm_approach: "re2" }),
        }),
        { OPTILLM: {} },
        containerFor,
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(forwarded, false);

    const authorized = await handleRequest(
        new Request("https://optillm.test/v1/chat/completions", {
            method: "POST",
            headers: { authorization: "Bearer ag_test" },
            body: JSON.stringify({ optillm_approach: "re2" }),
        }),
        { OPTILLM: {} },
        containerFor,
    );
    assert.equal(authorized.status, 200);
    assert.equal(forwarded, true);
});
