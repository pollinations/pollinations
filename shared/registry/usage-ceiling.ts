import {
    calculatePriceForModelDefinition,
    type ModelDefinition,
    type Usage,
    type UsageType,
} from "./registry.ts";

/** A hard bound on the sum of these usage buckets, not an average estimate. */
export type UsageLimit = {
    units: readonly UsageType[];
    maximum: number;
};

/**
 * Maximum Pollen price for bounded usage, independent of HTTP or payment rail.
 * A group shares one cap (e.g. cached + uncached prompt tokens); charge its
 * most expensive bucket at the highest declared rate across all variants.
 * Return null when a billable dimension has no bound. Output-derived fees
 * cannot be bounded by token/image/duration limits alone.
 */
export function calculateUsagePriceCeiling(
    model: string,
    definition: ModelDefinition,
    limits: readonly UsageLimit[],
): number | null {
    if (definition.billing?.adjustments?.length) return null;
    if (
        !Number.isFinite(definition.priceMultiplier) ||
        definition.priceMultiplier < 0
    )
        return null;

    const cost = { ...definition.cost };
    for (const sheet of [
        definition.cost,
        ...Object.values(definition.costVariants ?? {}),
    ]) {
        for (const [unit, rate] of Object.entries(sheet)) {
            if (rate === undefined) continue;
            if (!Number.isFinite(rate) || rate < 0) return null;
            const usageType = unit as UsageType;
            cost[usageType] = Math.max(cost[usageType] ?? 0, rate);
        }
    }
    const boundedUnits = new Set(limits.flatMap((limit) => [...limit.units]));
    if (
        Object.entries(cost).some(
            ([unit, rate]) =>
                (rate ?? 0) > 0 && !boundedUnits.has(unit as UsageType),
        )
    )
        return null;

    const usage: Usage = {};
    for (const { units, maximum } of limits) {
        if (!units.length || !Number.isFinite(maximum) || maximum < 0)
            return null;
        let mostExpensive = units[0];
        for (const unit of units) {
            if ((cost[unit] ?? 0) > (cost[mostExpensive] ?? 0))
                mostExpensive = unit;
        }
        usage[mostExpensive] = (usage[mostExpensive] ?? 0) + maximum;
    }
    const price = calculatePriceForModelDefinition(model, usage, {
        ...definition,
        cost,
        costVariants: undefined,
        selectCostVariant: undefined,
    }).totalPrice;
    return Number.isFinite(price) ? price : null;
}
