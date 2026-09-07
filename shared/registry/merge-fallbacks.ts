import type { ModelDefinition } from "./registry";

/**
 * An internal fallback route, stated as the difference from the model it stands
 * in for.
 *
 * Everything left out is inherited from that model, so the public identity a
 * caller sees — title, author, modalities — can never drift from the model they
 * asked for. `provider` is required because it is the one thing a route must
 * not inherit: it is what makes the route a route, and what the spend is
 * attributed to. The omitted fields are owned by the merge — a route is always
 * hidden and fallback-only, carries no aliases, and never chains further.
 */
export type FallbackDefinition = Partial<
    Omit<
        ModelDefinition,
        "aliases" | "fallbacks" | "fallbackOnly" | "hidden" | "provider"
    >
> & { provider: string };

/**
 * Fallback routes, keyed by the model they serve and then by the id each route
 * is registered under — the same key-is-the-id shape as the catalogs they merge
 * into. Routes are tried in key order, ahead of any cross-model `fallbacks` the
 * model declares itself, since a route still serves the model that was asked
 * for.
 */
export type FallbackMap = Record<string, Record<string, FallbackDefinition>>;

/** The ids the merge adds to the catalog. */
type RouteIds<TFallbacks extends FallbackMap> = {
    [ParentId in keyof TFallbacks]: keyof TFallbacks[ParentId];
}[keyof TFallbacks] &
    string;

/**
 * The catalog as it comes out: routes added as models, and every parent
 * carrying the `fallbacks` list the merge injected — which its own declaration
 * in the catalog no longer has to state.
 */
type Merged<TBase, TFallbacks extends FallbackMap> = TBase &
    Record<keyof TFallbacks, { fallbacks: string[] }> &
    Record<RouteIds<TFallbacks>, ModelDefinition>;

/**
 * Merges fallback routes into a service catalog: every parent gains the
 * `fallbacks` list naming its routes in order, and each route is expanded into
 * a full model definition placed directly after it, so ids and order match what
 * the catalog would look like if the routes were written out by hand.
 */
export function mergeFallbacks<
    TFallbacks extends FallbackMap,
    TBase extends Record<string, ModelDefinition> &
        Record<keyof TFallbacks, ModelDefinition>,
>(base: TBase, fallbacks: TFallbacks): Merged<TBase, TFallbacks> {
    const merged: Record<string, ModelDefinition> = {};
    for (const [parentId, parent] of Object.entries(base)) {
        const routes = (fallbacks as FallbackMap)[parentId];
        if (!routes) {
            merged[parentId] = parent;
            continue;
        }
        merged[parentId] = {
            ...parent,
            fallbacks: [...Object.keys(routes), ...(parent.fallbacks ?? [])],
        };
        const {
            aliases: _aliases,
            fallbacks: _fallbacks,
            fallbackOnly: _fallbackOnly,
            hidden: _hidden,
            ...inherited
        } = parent;
        for (const [routeId, overrides] of Object.entries(routes)) {
            merged[routeId] = {
                ...inherited,
                ...overrides,
                aliases: [],
                hidden: true,
                fallbackOnly: true,
            };
        }
    }
    return merged as Merged<TBase, TFallbacks>;
}
