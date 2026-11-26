import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { jobTools } from "../src/services/jobService.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const ID = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

const tool = (name) => jobTools.find(([n]) => n === name);

test("getGenerationJob returns a pending job as text with no resource link", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    let capturedUrl;
    globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        return new Response(
            JSON.stringify({ id: ID, status: "pending", created_at: "x" }),
            { headers: { "Content-Type": "application/json" } },
        );
    };
    const args = z.object(tool("getGenerationJob")[2]).parse({ id: ID });
    const res = await tool("getGenerationJob")[3](args, CONTEXT);
    assert.match(capturedUrl, /\/v1\/jobs\/9f86d0/);
    assert.equal(res.content.length, 1);
    assert.equal(res.content[0].type, "text");
    assert.match(res.content[0].text, /"status": "pending"/);
});

test("getGenerationJob attaches a resource link once the job succeeded", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    const resultUrl = `https://gen.pollinations.ai/v1/jobs/${ID}/result`;
    globalThis.fetch = async () =>
        new Response(
            JSON.stringify({
                id: ID,
                status: "succeeded",
                created_at: "x",
                completed_at: "y",
                result_url: resultUrl,
            }),
            { headers: { "Content-Type": "application/json" } },
        );
    const args = z.object(tool("getGenerationJob")[2]).parse({ id: ID });
    const res = await tool("getGenerationJob")[3](args, CONTEXT);
    assert.equal(res.content[0].type, "resource_link");
    assert.equal(res.content[0].uri, resultUrl);
    assert.match(res.content[1].text, /"status": "succeeded"/);
});

test("getGenerationJob rejects a job id that is not 64 hex chars", () => {
    assert.throws(() =>
        z.object(tool("getGenerationJob")[2]).parse({ id: "not-a-job-id" }),
    );
});
