import assert from "node:assert/strict";
import test from "node:test";
import {
    DeployStore,
    createDeploymentId,
    estimateBilling,
    requiredScopes,
    resolveProvider,
    resolveRuntime,
    routeForSurface,
} from "../src/api.js";
import { main } from "../src/cli.js";
import {
    createStarterManifest,
    validateBeeManifest,
} from "../src/schema.js";

test("deployment ids and routes are stable", () => {
    const id = createDeploymentId("Booking Assistant!");

    assert.equal(id, "bee_booking-assistant");
    assert.equal(
        routeForSurface("https://gen.pollinations.ai", id, "openai"),
        "https://gen.pollinations.ai/bees/bee_booking-assistant/v1/chat/completions",
    );
});

test("store creates deployment and events from manifest", () => {
    const store = new DeployStore();
    const deployment = store.create({
        name: "Booking Assistant",
        source: { type: "template", template: "musician-booking-reference" },
        runtime: { kind: "worker", provider: "cloudflare-agents" },
        state: { backend: "sqlite" },
        surfaces: ["openai", "web"],
        billing: { mode: "author-pays" },
    });

    assert.equal(deployment.status, "queued");
    assert.equal(deployment.surfaces.length, 2);
    assert.equal(store.events(deployment.id).length, 1);
});

test("auto runtime resolves to Cloudflare Agents", () => {
    assert.equal(
        resolveProvider({ kind: "worker", provider: "auto" }),
        "cloudflare-agents",
    );
    assert.equal(
        resolveProvider({ kind: "container", provider: "auto" }),
        "daytona",
    );
    assert.equal(
        resolveProvider({ kind: "container", provider: "aws-agentcore" }),
        "aws-agentcore",
    );
});

test("validates worker and container bee manifests", () => {
    const worker = createStarterManifest("Worker Bee");
    const container = {
        ...createStarterManifest("Container Bee"),
        runtime: { kind: "container", provider: "auto" },
        state: { backend: "memory", retentionDays: 30 },
    };

    assert.equal(validateBeeManifest(worker).valid, true);
    assert.equal(validateBeeManifest(container).valid, true);
});

test("manifest validation catches invalid runtime, state, surface, and user-pays client id", () => {
    const manifest = createStarterManifest("Bad Bee");
    delete manifest.billing.clientId;
    const badRuntime = {
        ...createStarterManifest("Bad Runtime"),
        runtime: { kind: "sandbox", provider: "auto" },
    };
    const badState = {
        ...createStarterManifest("Bad State"),
        state: { backend: "workspace" },
    };
    const badSurface = {
        ...createStarterManifest("Bad Surface"),
        surfaces: ["web", "mcp"],
    };
    const badProvider = {
        ...createStarterManifest("Bad Provider"),
        runtime: { kind: "worker", provider: "daytona" },
    };

    assert.equal(validateBeeManifest(manifest).valid, false);
    assert.ok(
        validateBeeManifest(manifest).errors.includes(
            "billing.clientId is required for user-pays bees",
        ),
    );
    assert.equal(validateBeeManifest(badRuntime).valid, false);
    assert.equal(validateBeeManifest(badState).valid, false);
    assert.equal(validateBeeManifest(badSurface).valid, false);
    assert.equal(validateBeeManifest(badProvider).valid, false);
});

test("cli init creates a starter manifest", async () => {
    const path = `/tmp/bee-${Date.now()}.json`;
    const result = await main(["init", path, "--name", "Demo Bee"]);
    const manifest = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8")));

    assert.equal(result.ok, true);
    assert.equal(manifest.name, "Demo Bee");
    assert.equal(manifest.runtime.kind, "worker");
    assert.equal(manifest.runtime.provider, "auto");
    assert.equal(manifest.state.backend, "sqlite");
});

test("cli validate reports manifest validity", async () => {
    const result = await main(["validate", "manifests/minimal-cloudflare.json"]);

    assert.equal(result.valid, true);
});

test("cli deploy reads a manifest file", async () => {
    const deployment = await main([
        "deploy",
        "manifests/minimal-cloudflare.json",
    ]);

    assert.equal(deployment.id, "bee_booking-assistant");
    assert.equal(deployment.runtime.provider, "cloudflare-agents");
    assert.equal(deployment.runtime.requestedProvider, "auto");
    assert.equal(deployment.state.backend, "sqlite");
    assert.deepEqual(deployment.requiredScopes.invocation, ["generate"]);
});

test("cli dry-run wraps deployment without changing projected URLs", async () => {
    const result = await main([
        "deploy",
        "manifests/minimal-cloudflare.json",
        "--dry-run",
    ]);

    assert.equal(result.dryRun, true);
    assert.equal(result.deployment.id, "bee_booking-assistant");
    assert.equal(result.deployment.billingEstimate.currency, "pollen");
    assert.ok(
        result.deployment.billingEstimate.meters.some(
            (meter) => meter.name === "orchestration_run",
        ),
    );
});

test("cli deploy can override runtime provider", async () => {
    const deployment = await main([
        "deploy",
        "manifests/minimal-cloudflare.json",
        "--runtime",
        "daytona",
    ]);

    assert.equal(deployment.runtime.provider, "daytona");
    assert.equal(deployment.runtime.requestedProvider, "daytona");
    assert.equal(deployment.runtime.kind, "container");
    assert.ok(
        deployment.billingEstimate.meters.some(
            (meter) => meter.name === "runtime_compute",
        ),
    );
});

test("cli status, events, list, and delete use the same deployment store", async () => {
    const path = `/tmp/bee-status-${Date.now()}.json`;
    const manifest = {
        ...createStarterManifest("Status Bee"),
        name: `Status Bee ${Date.now()}`,
    };
    await import("node:fs/promises").then((fs) =>
        fs.writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`),
    );

    const deployment = await main(["deploy", path]);
    const status = await main(["status", deployment.id]);
    const events = await main(["events", deployment.id]);
    const list = await main(["list"]);
    const deleted = await main(["delete", deployment.id]);

    assert.equal(status.id, deployment.id);
    assert.equal(events.length, 1);
    assert.ok(list.some((item) => item.id === deployment.id));
    assert.equal(deleted.deleted, true);
});

test("cli delete returns whether a deployment existed", async () => {
    const deployment = await main(["deploy", "manifests/minimal-daytona.json"]);
    const result = await main(["delete", deployment.id]);

    assert.equal(result.deleted, true);
});

test("runtime, scopes, and billing helpers are deterministic", () => {
    const manifest = createStarterManifest("Helper Bee");
    const runtime = resolveRuntime(manifest.runtime);
    const billing = estimateBilling(manifest, runtime);
    const scopes = requiredScopes(manifest);

    assert.equal(runtime.kind, "worker");
    assert.equal(runtime.provider, "cloudflare-agents");
    assert.deepEqual(scopes.developer, ["bees:read", "bees:write"]);
    assert.deepEqual(scopes.invocation, ["generate"]);
    assert.equal(billing.currency, "pollen");
});
