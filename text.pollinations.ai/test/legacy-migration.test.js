import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import cors from "cors";
import express from "express";
import {
    GEN_DOCS_URL,
    MIGRATION_GUIDE_URL,
} from "../../shared/legacy-migration.js";
import {
    CORS_EXPOSED_HEADERS,
    legacyMigrationHeaders,
    migrationErrorFields,
    modelNotFoundMessage,
    sendMigrationGuide,
} from "../legacyMigration.js";

// Same wiring as server.js, without the generation stack.
const app = express();
app.use(cors({ exposedHeaders: CORS_EXPOSED_HEADERS }));
app.use(legacyMigrationHeaders);
app.get("/", sendMigrationGuide);
app.get("/models", (req, res) => res.json([]));
app.post("/openai", (req, res) =>
    res.status(404).json({
        error: modelNotFoundMessage("no-such-model"),
        status: 404,
        ...migrationErrorFields(),
    }),
);

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
    server.close();
});

function assertMigrationHeaders(response) {
    assert.equal(
        response.headers.get("X-Pollinations-Migration"),
        MIGRATION_GUIDE_URL,
    );
    assert.equal(response.headers.get("X-Pollinations-Docs"), GEN_DOCS_URL);
    assert.equal(
        response.headers.get("X-Pollinations-Signup"),
        "https://enter.pollinations.ai/?ref=text",
    );
    assert.match(response.headers.get("Link"), /rel="deprecation"/);
    assert.match(response.headers.get("Link"), /rel="successor-version"/);
}

test("root serves the migration guide instead of redirecting to APIDOCS.md", async () => {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    const body = await response.text();
    assert.doesNotMatch(body, /master\/APIDOCS\.md/);
    assert.match(body, /gen\.pollinations\.ai\/text\/\{prompt\}/);
    assert.match(body, /gen\.pollinations\.ai\/v1\/chat\/completions/);
    assert.match(body, /gen\.pollinations\.ai\/image\/\{prompt\}/);
    assert.match(body, /Authorization: Bearer/);
    assert.match(body, /\?ref=text/);
    assert.match(body, /\?ref=image/);
    assertMigrationHeaders(response);
});

test("migration headers are exposed to browsers via CORS", async () => {
    const response = await fetch(`${baseUrl}/models`, {
        headers: { Origin: "https://example.com" },
    });

    assertMigrationHeaders(response);
    const exposed = response.headers.get("access-control-expose-headers");
    for (const name of [
        "Payment-Required",
        "X-Pollinations-Migration",
        "X-Pollinations-Docs",
        "X-Pollinations-Signup",
        "Link",
    ]) {
        assert.match(exposed, new RegExp(name));
    }
});

test("error responses carry machine-readable migration links", async () => {
    const response = await fetch(`${baseUrl}/openai`, { method: "POST" });

    assert.equal(response.status, 404);
    assertMigrationHeaders(response);
    const body = await response.json();
    assert.deepEqual(body.migration, {
        guide: MIGRATION_GUIDE_URL,
        docs: GEN_DOCS_URL,
        signup: "https://enter.pollinations.ai/?ref=text",
    });
    assert.match(body.deprecation_notice, /gen\.pollinations\.ai/);
    assert.match(body.error, /gen\.pollinations\.ai\/text\/models/);
    assert.match(body.error, /\?ref=text/);
});
