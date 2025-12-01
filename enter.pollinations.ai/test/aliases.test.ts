import { test, expect } from "vitest";
import {
    resolveServiceId,
    ServiceDefinition,
} from "@shared/registry/registry.js";
import { TEXT_SERVICES } from "@shared/registry/text";
import { IMAGE_SERVICES } from "@shared/registry/image";

function serviceAliasTestCases(
    services: Record<string, ServiceDefinition>,
): string[][] {
    return Object.entries(services).flatMap(([serviceId, serviceDefinition]) =>
        serviceDefinition.aliases.map((alias) => [alias, serviceId]),
    );
}

test.for(serviceAliasTestCases(TEXT_SERVICES))(
    "Text service alias %s is resolved to %s",
    ([alias, shouldResolveTo]) => {
        const resolved = resolveServiceId(alias, "generate.text");
        expect(resolved).toBe(shouldResolveTo);
    },
);

test.for(serviceAliasTestCases(IMAGE_SERVICES))(
    "Image service alias %s is resolved to %s",
    ([alias, shouldResolveTo]) => {
        const resolved = resolveServiceId(alias, "generate.image");
        expect(resolved).toBe(shouldResolveTo);
    },
);
