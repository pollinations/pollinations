import { describe, expect, test } from "vitest";
import {
    assertBeeManifest,
    type BeeManifest,
    createDryRunDeployment,
    validateBeeManifest,
    withRuntimeOverride,
} from "./bees.js";

const minimalManifest: BeeManifest = {
    name: "booking-assistant",
    source: {
        type: "git",
        repository: "https://github.com/example/booking-assistant.git",
    },
    surfaces: ["openai", "web", "a2a"],
    billing: {
        mode: "user-pays",
        clientId: "pk_app_key",
    },
};

describe("bee manifest helpers", () => {
    test("accepts a minimal manifest and resolves worker/sqlite defaults", () => {
        const normalized = assertBeeManifest(minimalManifest);

        expect(normalized.runtime).toEqual({
            kind: "worker",
            provider: "auto",
        });
        expect(normalized.state).toEqual({ backend: "sqlite" });
    });

    test("rejects invalid runtime kind", () => {
        const result = validateBeeManifest({
            ...minimalManifest,
            runtime: { kind: "workspace" },
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "runtime.kind must be one of worker, container",
        );
    });

    test("rejects invalid state backend", () => {
        const result = validateBeeManifest({
            ...minimalManifest,
            state: { backend: "github" },
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "state.backend must be one of memory, kv, durable-object, sqlite",
        );
    });

    test("requires clientId for user-pays bees", () => {
        const result = validateBeeManifest({
            ...minimalManifest,
            billing: { mode: "user-pays" },
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
            "billing.clientId is required for user-pays bees",
        );
    });

    test("runtime override maps daytona to container", () => {
        const overridden = assertBeeManifest(
            withRuntimeOverride(minimalManifest, "daytona"),
        );

        expect(overridden.runtime).toEqual({
            kind: "container",
            provider: "daytona",
        });
    });

    test("dry-run deployment includes projected urls, scopes, and meters", () => {
        const deployment = createDryRunDeployment(
            assertBeeManifest(minimalManifest),
        );

        expect(deployment.id).toBe("bee_booking-assistant");
        expect(deployment.runtime).toMatchObject({
            kind: "worker",
            provider: "cloudflare-agents",
            requestedProvider: "auto",
        });
        expect(deployment.requiredScopes).toEqual({
            developer: ["bees:read", "bees:write"],
            invocation: ["generate"],
        });
        expect(deployment.surfaces.map((surface) => surface.kind)).toEqual([
            "openai",
            "web",
            "a2a",
        ]);
        expect(
            deployment.billingEstimate.meters.map((meter) => meter.name),
        ).toContain("state_retention");
    });
});
