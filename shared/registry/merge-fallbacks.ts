import type { ModelDefinition } from "./registry";

/**
 * A fallback route, stated as the difference from the model it stands in for.
 *
 * Everything left out is inherited from that model, so the public identity a
 * caller sees — title, brand, modalities — can never drift from the model they
 * asked for. The omitted fields are owned by the merge: a route is always
 * hidden, carries no aliases of its own, and never chains further.
 */
export type FallbackDefinition = Partial<
    Omit<
        ModelDefinition,
        "aliases" | "fallbacks" | "fallbackOnStatusCodes" | "hidden"
    >
> & {
    // Declared, never derived from the parent id: this id is stored in API-key
    // permissions, so generating it would turn a rename into a data migration.
    id: string;
};

/**
 * Fallback targets, keyed by the model they serve and tried in order.
 *
 * A string names an existing top-level model; an object defines an internal
 * route that exists only as a fallback. Both live in the same ordered list, so
 * the try-order is readable in one place.
 */
export type FallbackMap = Record<
    string,
    readonly (string | FallbackDefinition)[]
>;

/**
 * Merges fallback routes into a service catalog: every parent gains the
 * `fallbacks` list naming its routes, and each route is expanded into a full
 * model definition placed directly after it, so ids and order match what the
 * catalog would look like if the routes were written out by hand.
 */
export function mergeFallbacks<
    TFallbacks extends FallbackMap,
    TBase extends Record<string, ModelDefinition> &
        Record<keyof TFallbacks, ModelDefinition>,
>(
    base: TBase,
    fallbacks: TFallbacks,
): TBase &
    Record<
        Extract<TFallbacks[keyof TFallbacks][number], FallbackDefinition>["id"],
        ModelDefinition
    > {
    const merged: Record<string, ModelDefinition> = {};
    for (const [parentId, parent] of Object.entries(base)) {
        const routes = (fallbacks as FallbackMap)[parentId];
        if (!routes) {
            merged[parentId] = parent;
            continue;
        }
        merged[parentId] = {
            ...parent,
            fallbacks: routes.map((r) => (typeof r === "string" ? r : r.id)),
        };
        const {
            aliases: _aliases,
            fallbacks: _fallbacks,
            fallbackOnStatusCodes: _statusCodes,
            ...inherited
        } = parent;
        for (const route of routes) {
            // A string target is an existing model; only objects define one.
            if (typeof route === "string") continue;
            const { id, ...overrides } = route;
            merged[id] = {
                ...inherited,
                ...overrides,
                aliases: [],
                hidden: true,
            };
        }
    }
    return merged as TBase &
        Record<
            Extract<
                TFallbacks[keyof TFallbacks][number],
                FallbackDefinition
            >["id"],
            ModelDefinition
        >;
}
