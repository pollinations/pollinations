import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import {
    MIGRATION_ERROR_CODE,
    MIGRATION_URL,
    sendLegacyAuthMigrationResponse,
} from "../authRedirect.js";

const app = express();
app.use(express.json());
app.get("/:prompt", (req, res) =>
    sendLegacyAuthMigrationResponse(res, { stream: req.query.stream === "true" }),
);
app.post("/openai", (req, res) =>
    sendLegacyAuthMigrationResponse(res, { stream: !!req.body.stream }),
);

function assertMigrationBody(body) {
    assert.equal(body.code, MIGRATION_ERROR_CODE);
    assert.equal(body.status, 403);
    assert.equal(body.migration_url, MIGRATION_URL);
    assert.match(body.error, /enter\.pollinations\.ai/);
    // Must not look like model output
    assert.equal(body.choices, undefined);
    assert.equal(body.object, undefined);
}

test("non-streaming POST gets a non-cacheable JSON migration error", async () => {
    const res = await request(app)
        .post("/openai")
        .send({ messages: [{ role: "user", content: "hi" }] });
    assert.equal(res.status, 403);
    assert.match(res.headers["content-type"], /application\/json/);
    assert.equal(res.headers["cache-control"], "private, no-store");
    assert.equal(res.headers["x-pollinations-migration"], MIGRATION_URL);
    assertMigrationBody(res.body);
});

test("non-streaming GET gets the same JSON error instead of plain text", async () => {
    const res = await request(app).get("/hello");
    assert.equal(res.status, 403);
    assert.match(res.headers["content-type"], /application\/json/);
    assert.equal(res.headers["cache-control"], "private, no-store");
    assertMigrationBody(res.body);
});

test("streaming request keeps SSE framing and ends with [DONE]", async () => {
    const res = await request(app)
        .post("/openai")
        .send({ stream: true, messages: [{ role: "user", content: "hi" }] })
        .buffer(true)
        .parse((response, done) => {
            let data = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                data += chunk;
            });
            response.on("end", () => done(null, data));
        });
    assert.equal(res.status, 403);
    assert.match(res.headers["content-type"], /text\/event-stream/);
    assert.equal(res.headers["cache-control"], "private, no-store");
    const events = res.body
        .split("\n\n")
        .filter(Boolean)
        .map((event) => event.replace(/^data: /, ""));
    assert.equal(events.length, 2);
    assertMigrationBody(JSON.parse(events[0]));
    assert.equal(events[1], "[DONE]");
});
