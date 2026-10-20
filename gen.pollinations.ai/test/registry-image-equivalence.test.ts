import { IMAGE_SERVICES as FROM_FILES } from "@shared/registry/image/index.ts";
import { IMAGE_SERVICES as LEGACY } from "@shared/registry/image.ts";
import { describe, expect, it } from "vitest";

// Functions (inline selectCostVariant closures, transform refs) are distinct
// instances across the two module graphs; compare them by source instead.
function normalize(value: unknown): unknown {
    if (typeof value === "function") {
        return `ƒ ${value.toString().replace(/\s+/g, " ")}`;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(
                ([key, entry]) => [key, normalize(entry)],
            ),
        );
    }
    return value;
}

// Expand-phase guard: the per-model file tree must load the exact catalog the
// legacy table produces (entries, fallback merge, parent fallback lists).
describe("image registry per-model files", () => {
    it("produces the same catalog as the legacy IMAGE_SERVICES table", () => {
        expect(normalize(FROM_FILES)).toEqual(normalize(LEGACY));
    });

    it("exposes the same ids, including merged fallback routes", () => {
        expect(Object.keys(FROM_FILES).sort()).toEqual(
            Object.keys(LEGACY).sort(),
        );
        expect(Object.keys(FROM_FILES)).toHaveLength(98);
    });
});
