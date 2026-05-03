import assert from "node:assert/strict";
import test from "node:test";
import {
    type BeeDeploymentRequest,
    createDeploymentId,
    createQueuedDeployment,
    deploymentPathForName,
    handleBeeDeployApiRequest,
    MemoryBeeDeployApiStore,
    projectDeploymentRoutes,
} from "../src/deploy-api/index.js";

const request: BeeDeploymentRequest = {
    name: "Booking Assistant!",
    source: {
        type: "git",
        repository: "https://github.com/example/booking-bee.git",
        ref: "main",
        packagePath: "bees/booking",
    },
    runtime: {
        kind: "worker",
        provider: "auto",
    },
    state: {
        backend: "sqlite",
        retentionDays: 7,
    },
    surfaces: ["openai", "web", "discord", "a2a"],
    billing: {
        mode: "user-pays",
        clientId: "pk_demo",
        dailyPollenLimit: 5,
    },
};

test("deployment ids are stable and URL-safe", () => {
    assert.equal(createDeploymentId(request.name), "bee_booking-assistant");
});

test("deployment routes project all requested surfaces", () => {
    const routes = projectDeploymentRoutes(
        request,
        "https://gen.pollinations.ai/",
    );

    assert.deepEqual(
        routes.map((route) => route.kind),
        ["openai", "web", "discord", "a2a"],
    );
    assert.equal(
        routes.find((route) => route.kind === "openai")?.url,
        "https://gen.pollinations.ai/bees/bee_booking-assistant/v1/chat/completions",
    );
    assert.equal(
        routes.find((route) => route.kind === "a2a")?.url,
        "https://gen.pollinations.ai/bees/bee_booking-assistant/.well-known/agent-card.json",
    );
});

test("queued deployments preserve runtime and timestamps", () => {
    const deployment = createQueuedDeployment(
        request,
        "https://gen.pollinations.ai",
        new Date("2026-05-03T00:00:00.000Z"),
    );

    assert.equal(deployment.status, "queued");
    assert.equal(deployment.runtime.kind, "worker");
    assert.equal(deployment.runtime.provider, "cloudflare-agents");
    assert.equal(deployment.runtime.requestedProvider, "auto");
    assert.equal(deployment.state.backend, "sqlite");
    assert.deepEqual(deployment.requiredScopes.invocation, ["generate"]);
    assert.ok(
        deployment.billingEstimate.meters.some(
            (meter) => meter.name === "orchestration_run",
        ),
    );
    assert.equal(deployment.createdAt, "2026-05-03T00:00:00.000Z");
});

test("deployment API reference router creates, reads, patches, events, and deletes", async () => {
    const store = new MemoryBeeDeployApiStore();
    const created = await handleBeeDeployApiRequest(
        new Request("https://gen.pollinations.ai/v1/bees", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request),
        }),
        { store },
    );
    const read = await handleBeeDeployApiRequest(
        new Request(
            `https://gen.pollinations.ai${deploymentPathForName(request.name)}`,
        ),
        { store },
    );
    const list = await handleBeeDeployApiRequest(
        new Request("https://gen.pollinations.ai/v1/bees"),
        { store },
    );
    const patched = await handleBeeDeployApiRequest(
        new Request(
            `https://gen.pollinations.ai${deploymentPathForName(request.name)}`,
            {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    runtime: { kind: "container", provider: "daytona" },
                    state: { backend: "memory", retentionDays: 30 },
                }),
            },
        ),
        { store },
    );
    const events = await handleBeeDeployApiRequest(
        new Request(
            `https://gen.pollinations.ai${deploymentPathForName(
                request.name,
            )}/events`,
        ),
        { store },
    );
    const deleted = await handleBeeDeployApiRequest(
        new Request(
            `https://gen.pollinations.ai${deploymentPathForName(request.name)}`,
            { method: "DELETE" },
        ),
        { store },
    );

    assert.equal(created.status, 202);
    assert.equal(read.status, 200);
    assert.equal(list.status, 200);
    assert.equal(patched.status, 200);
    assert.equal(events.status, 200);
    assert.equal(deleted.status, 204);
    assert.equal(
        ((await patched.json()) as { runtime: { provider: string } }).runtime
            .provider,
        "daytona",
    );
    assert.equal(((await list.json()) as unknown[]).length, 1);
    assert.equal(((await events.json()) as unknown[]).length, 2);
});

test("patching runtime updates billing meters and state backend", async () => {
    const store = new MemoryBeeDeployApiStore();
    const created = await store.create(request, "https://gen.pollinations.ai");
    const patched = await store.patch(created.id, {
        runtime: { kind: "container", provider: "aws-agentcore" },
        state: { backend: "memory", retentionDays: 14 },
    });

    assert.equal(patched?.runtime.kind, "container");
    assert.equal(patched?.runtime.provider, "aws-agentcore");
    assert.equal(patched?.state.backend, "memory");
    assert.ok(
        patched?.billingEstimate.meters.some(
            (meter) => meter.name === "runtime_compute",
        ),
    );
});
