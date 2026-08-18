import type { ModelDefinition } from "./registry";

/**
 * An internal fallback route, stated as the difference from the model it stands
 * in for.
 *
 * Everything left out is inherited from that model, so the public identity a
 * caller sees — title, brand, modalities — can never drift from the model they
 * asked for. `id` and `provider` are always stated: a route is a model like any
 * other, dispatched by id and attributed to its provider. The omitted fields are
 * owned by the merge — a route is always hidden, carries no aliases of its own,
 * and never chains further.
 */
export type FallbackDefinition = Partial<
    Omit<
        ModelDefinition,
        | "aliases"
        | "fallbacks"
        | "fallbackOnStatusCodes"
        | "hidden"
        | "provider"
    >
> & { id: string; provider: string };

/**
 * Fallback targets, keyed by the model they serve and tried in order.
 *
 * A string names an existing top-level model; an object defines an internal
 * route. Both live in the same ordered list, so the try-order is readable in
 * one place.
 */
export type FallbackMap = Record<
    string,
    readonly (string | FallbackDefinition)[]
>;

/** Ids contributed by parents that define routes, not just name existing models. */
type RouteIds<TFallbacks extends FallbackMap> = Extract<
    TFallbacks[keyof TFallbacks][number],
    FallbackDefinition
>["id"];

/**
 * Merges fallback targets into a service catalog: every parent gains the
 * `fallbacks` list naming its targets in order, and each route is expanded into
 * a full model definition placed directly after it, so ids and order match what
 * the catalog would look like if the routes were written out by hand.
 */
export function mergeFallbacks<
    TFallbacks extends FallbackMap,
    TBase extends Record<string, ModelDefinition> &
        Record<keyof TFallbacks, ModelDefinition>,
>(
    base: TBase,
    fallbacks: TFallbacks,
): TBase & Record<RouteIds<TFallbacks>, ModelDefinition> {
    const merged: Record<string, ModelDefinition> = {};
    for (const [parentId, parent] of Object.entries(base)) {
        const targets = (fallbacks as FallbackMap)[parentId];
        if (!targets) {
            merged[parentId] = parent;
            continue;
        }
        merged[parentId] = {
            ...parent,
            fallbacks: targets.map((target) =>
                typeof target === "string" ? target : target.id,
            ),
        };
        const {
            aliases: _aliases,
            fallbacks: _fallbacks,
            fallbackOnStatusCodes: _statusCodes,
            ...inherited
        } = parent;
        for (const target of targets) {
            // A string names an existing model; only objects define a route.
            if (typeof target === "string") continue;
            const { id, ...overrides } = target;
            merged[id] = {
                ...inherited,
                ...overrides,
                aliases: [],
                hidden: true,
            };
        }
    }
    return merged as TBase & Record<RouteIds<TFallbacks>, ModelDefinition>;
}
