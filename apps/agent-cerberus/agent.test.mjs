import assert from "node:assert/strict";
import { test } from "node:test";
import agent from "./agent.ts";

for (const choice of ["contain", "investigate", "maintain"]) {
    test(`Jev ${choice} selects the corresponding playbook and preserves streaming`, async () => {
        const calls = [];
        const response = await agent({
            request: new Request("https://agent.test", {
                method: "POST",
                body: JSON.stringify({
                    input: "A recorded security review summary.",
                    stream: true,
                }),
            }),
            pollinations: async (path, init) => {
                calls.push({ path, body: JSON.parse(init.body) });
                if (path === "/alpha/decisions")
                    return Response.json({
                        answers: {
                            action: {
                                choice,
                                probabilities: {
                                    contain: 0.2,
                                    investigate: 0.3,
                                    maintain: 0.5,
                                },
                            },
                        },
                    });
                return new Response("streamed explanation");
            },
        });
        assert.equal(calls[0].path, "/alpha/decisions");
        assert.equal(JSON.parse(calls[1].body.input).selectedAction, choice);
        assert.ok(JSON.parse(calls[1].body.input).playbook.length > 40);
        assert.equal(calls[1].body.stream, true);
        assert.equal(await response.text(), "streamed explanation");
    });
}
test("Invalid decisions do not trigger a model explanation or fabricated action", async () => {
    let calls = 0;
    const response = await agent({
        request: new Request("https://agent.test", {
            method: "POST",
            body: JSON.stringify({
                input: "A possible vulnerability to review.",
            }),
        }),
        pollinations: async () => {
            calls++;
            return Response.json({
                answers: {
                    action: { choice: "delete everything", probabilities: {} },
                },
            });
        },
    });
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
});
