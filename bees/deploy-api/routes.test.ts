import assert from "node:assert/strict";
import { test } from "node:test";

import { makeDeployRoutes } from "./routes.ts";

const VALID = {
    id: "catgpt-clone",
    display_name: "x",
    description: "x",
    model: "claude-fast",
    surfaces: ["openai", "web"],
    state: { scope: "per-user" },
    billing: { default: "user-pays", clientId: "pk_real_app_key" },
    name: "demo-bee",
    source: { type: "git", repository: "https://github.com/me/bee.git" },
};

function bearer(req: object): Request {
    return new Request("http://x/v1/bees", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer sk_dev_key",
        },
        body: JSON.stringify(req),
    });
}

function reqAt(
    method: string,
    path: string,
    body?: object,
    token = "sk_dev_key",
): Request {
    return new Request(`http://x${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

test("missing Authorization → 401", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(new Request("http://x/v1/bees", { method: "GET" }));
    assert.equal(res.status, 401);
});

test("pk_ token in Authorization → 401 with explanatory error", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(reqAt("GET", "/v1/bees", undefined, "pk_app_key"));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /sk_/);
});

test("POST /v1/bees creates a deployment with 201 + Location header", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(bearer(VALID));
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("location"), "/v1/bees/bee_demo-bee");
    const body = (await res.json()) as any;
    assert.equal(body.id, "bee_demo-bee");
    assert.equal(body.status, "queued");
    assert.ok(body.billingEstimate, "decorated with billing estimate");
    assert.ok(body.requiredScopes, "decorated with required scopes");
});

test("duplicate POST → 409 conflict", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const res = await fetch(bearer(VALID));
    assert.equal(res.status, 409);
});

test("POST /v1/bees?upgrade=1 updates in place → 200", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const upgrade = await fetch(
        reqAt("POST", "/v1/bees?upgrade=1", {
            ...VALID,
            description: "updated",
        }),
    );
    assert.equal(upgrade.status, 200);
    const body = (await upgrade.json()) as any;
    assert.equal(body.manifest.description, "updated");
});

test("POST /v1/bees with invalid manifest → 400 + errors array", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(bearer({ ...VALID, name: "BAD-Name" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; errors: string[] };
    assert.match(body.error, /invalid manifest/);
    assert.ok(body.errors.some((e) => e.includes("name")));
});

test("GET /v1/bees lists deployments", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    await fetch(bearer({ ...VALID, name: "demo-bee-2" }));
    const res = await fetch(reqAt("GET", "/v1/bees"));
    const body = (await res.json()) as { items: any[] };
    assert.equal(body.items.length, 2);
});

test("GET /v1/bees/{id} returns the deployment", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const res = await fetch(reqAt("GET", "/v1/bees/bee_demo-bee"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.id, "bee_demo-bee");
});

test("GET /v1/bees/{id} for missing deployment → 404", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(reqAt("GET", "/v1/bees/bee_does-not-exist"));
    assert.equal(res.status, 404);
});

test("PATCH /v1/bees/{id} merges patch and returns updated", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const res = await fetch(
        reqAt("PATCH", "/v1/bees/bee_demo-bee", {
            billing: { default: "author-pays" },
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.manifest.billing.default, "author-pays");
});

test("DELETE /v1/bees/{id} returns 204 and soft-deletes", async () => {
    const { fetch, store } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const res = await fetch(reqAt("DELETE", "/v1/bees/bee_demo-bee"));
    assert.equal(res.status, 204);
    assert.equal(store.get("bee_demo-bee")?.status, "deleted");
});

test("GET /v1/bees/{id}/events returns the event log", async () => {
    const { fetch, store } = makeDeployRoutes();
    await fetch(bearer(VALID));
    store.transition("bee_demo-bee", "building");
    const res = await fetch(reqAt("GET", "/v1/bees/bee_demo-bee/events"));
    const body = (await res.json()) as { items: any[] };
    assert.equal(body.items.length, 2);
});

test("POST /v1/bees/{id}/transitions can drive the state machine", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const t = await fetch(
        reqAt("POST", "/v1/bees/bee_demo-bee/transitions", {
            to: "building",
            message: "starting build",
        }),
    );
    assert.equal(t.status, 200);
    const body = (await t.json()) as any;
    assert.equal(body.status, "building");
});

test("invalid transition → 409", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    // queued → ready is not allowed
    const t = await fetch(
        reqAt("POST", "/v1/bees/bee_demo-bee/transitions", { to: "ready" }),
    );
    assert.equal(t.status, 409);
});

test("unknown route → 404", async () => {
    const { fetch } = makeDeployRoutes();
    const res = await fetch(reqAt("GET", "/v1/banana"));
    assert.equal(res.status, 404);
});

test("405 on wrong method", async () => {
    const { fetch } = makeDeployRoutes();
    await fetch(bearer(VALID));
    const res = await fetch(reqAt("PUT", "/v1/bees/bee_demo-bee"));
    assert.equal(res.status, 405);
});
