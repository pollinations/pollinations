import type { ModelDefinition } from "./registry";

/**
 * A fallback route, stated as the difference from the model it stands in for.
 *
 * Everything left out is inherited from that model, so the public identity a
 * caller sees — title, brand, modalities — can never drift from the model they
 * asked for. The omitted fields are owned by the merge below: a route is always
 * hidden, carries no aliases of its own, and never chains further.
 */
type FallbackDefinition = Partial<
    Omit<
        ModelDefinition,
        "aliases" | "fallbacks" | "fallbackOnStatusCodes" | "hidden"
    >
> & {
    // Declared, never derived from the parent id: this id is stored in API-key
    // permissions, so generating it would turn a rename into a data migration.
    id: string;
};

/** Fallback routes, keyed by the model they serve and tried in order. */
const IMAGE_FALLBACKS = {
    zimage: [
        {
            id: "zimage-fal",
            provider: "fal",
            addedDate: new Date("2026-08-10").getTime(),
            paidOnly: true,
            // Fal bills $0.005 per output megapixel. The token line stays at
            // zero; the adjustment below records the exact provider cost while
            // the caller keeps the public zimage flat price.
            cost: {
                completionImageTokens: 0,
            },
            billing: {
                adjustments: [
                    {
                        id: "fal.zimage.output_megapixels.v1",
                        description: "Fal output image megapixels",
                        kind: "image",
                        unit: "megapixel",
                        unitCost: 0.005,
                        publicPricing: {
                            label: "Output megapixels",
                            quantity: 1,
                            unit: "megapixel",
                        },
                        countUnits: (_output, input) =>
                            Math.max(0, input?.megapixels ?? 0),
                    },
                ],
            },
        },
    ],
} as const satisfies Record<string, readonly FallbackDefinition[]>;

type FallbackParent = keyof typeof IMAGE_FALLBACKS;
type FallbackId = (typeof IMAGE_FALLBACKS)[FallbackParent][number]["id"];

/**
 * Merges the routes above into the image catalog: every parent gains the
 * `fallbacks` list naming its routes, and each route is expanded into a full
 * model definition placed directly after it, so ids and order match what the
 * catalog would look like if the routes were written out by hand.
 */
export function withImageFallbacks<
    TBase extends Record<string, ModelDefinition> &
        Record<FallbackParent, ModelDefinition>,
>(base: TBase): TBase & Record<FallbackId, ModelDefinition> {
    const merged: Record<string, ModelDefinition> = {};
    for (const [parentId, parent] of Object.entries(base)) {
        const routes = (
            IMAGE_FALLBACKS as Record<string, readonly FallbackDefinition[]>
        )[parentId];
        if (!routes) {
            merged[parentId] = parent;
            continue;
        }
        merged[parentId] = { ...parent, fallbacks: routes.map((r) => r.id) };
        const {
            aliases: _aliases,
            fallbacks: _fallbacks,
            fallbackOnStatusCodes: _statusCodes,
            ...inherited
        } = parent;
        for (const { id, ...overrides } of routes) {
            merged[id] = {
                ...inherited,
                ...overrides,
                aliases: [],
                hidden: true,
            };
        }
    }
    return merged as TBase & Record<FallbackId, ModelDefinition>;
}
