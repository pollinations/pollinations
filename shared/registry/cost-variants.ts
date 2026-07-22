import type {
    BillingContext,
    CostDefinition,
    ModelDefinition,
} from "./registry";

export function defineCostVariants<
    const Variants extends Record<string, Partial<CostDefinition>>,
>(
    costVariants: Variants,
    resolveCostVariant: (context: BillingContext) => keyof Variants & string,
): Pick<ModelDefinition, "costVariants" | "resolveCostVariant"> {
    return { costVariants, resolveCostVariant };
}
