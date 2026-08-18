import type { ModelDefinition } from "./registry";

/**
 * An internal fallback route, stated as the difference from the model it stands
 * in for.
 *
 * Everything left out is inherited from that model, so the public identity a
 * caller sees — title, brand, modalities — can never drift from the model they
 * asked for. `provider` is required because it is what makes a route a route,
 * and it names the id the route is registered under. The remaining omitted
 * fields are owned by the merge: a route is always hidden, carries no aliases
 * of its own, and never chains further.
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
> & { provider: string };

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

/**
 * Ids are derived, never written: `<model>-<provider>-fallback-<n>`, numbered by
 * position in the list so two routes through the same provider stay distinct.
 * Reordering or repointing a route therefore renames it.
 */
const routeId = (parentId: string, provider: string, index: number) =>
    `${parentId}-${provider}-fallback-${index + 1}`;

/** Position index to 1-based label. Also caps how many routes a model can declare. */
type Ordinal = { "0": "1"; "1": "2"; "2": "3"; "3": "4"; "4": "5"; "5": "6" };
type Slot<TTargets> = Extract<keyof TTargets, keyof Ordinal>;

/** Ids contributed by parents that define routes, not just name existing models. */
type RouteIds<TFallbacks extends FallbackMap> = {
    [K in keyof TFallbacks & string]: {
        [I in Slot<TFallbacks[K]>]: TFallbacks[K][I] extends FallbackDefinition
            ? `${K}-${TFallbacks[K][I]["provider"]}-fallback-${Ordinal[I]}`
            : never;
    }[Slot<TFallbacks[K]>];
}[keyof TFallbacks & string];

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
            fallbacks: targets.map((target, index) =>
                typeof target === "string"
                    ? target
                    : routeId(parentId, target.provider, index),
            ),
        };
        const {
            aliases: _aliases,
            fallbacks: _fallbacks,
            fallbackOnStatusCodes: _statusCodes,
            ...inherited
        } = parent;
        for (const [index, target] of targets.entries()) {
            // A string names an existing model; only objects define a route.
            if (typeof target === "string") continue;
            merged[routeId(parentId, target.provider, index)] = {
                ...inherited,
                ...target,
                aliases: [],
                hidden: true,
            };
        }
    }
    return merged as TBase & Record<RouteIds<TFallbacks>, ModelDefinition>;
}
