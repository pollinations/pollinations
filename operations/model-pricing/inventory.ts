import { findModelByName } from "../../gen.pollinations.ai/src/text/availableModels.ts";

import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import {
    getModels,
    getRegistryModelDefinition,
} from "../../shared/registry/registry.ts";

// Only explicitly selected metadata crosses into research; never serialize configs/auth.
export const inventory = getModels().map((name) => {
    const definition = getRegistryModelDefinition(name);
    const supported = definition.category === "text";
    const config = supported
        ? findModelByName(name)?.config({ model: name })
        : undefined;
    return {
        name,
        aliases: definition.aliases,
        provider: definition.provider,
        category: definition.category,
        hidden: definition.hidden ?? false,
        inputModalities: definition.inputModalities,
        outputModalities: definition.outputModalities,
        fallbackOnly: definition.fallbackOnly ?? false,
        fallbacks: definition.fallbacks ?? [],
        cost: definition.cost,
        costVariants: definition.costVariants,
        billingAdjustments:
            definition.billing?.adjustments?.map((a) => ({
                id: a.id,
                unit: a.unit,
                unitCost: a.unitCost,
            })) ?? [],
        retirementDate: definition.retirementDate,
        publicPricing: modelInfoFromDefinition(name, definition).pricing,
        route: config
            ? {
                  model: config.model ?? config["vertex-model-id"],
                  account: config["azure-resource-name"],
                  deployment: config["azure-deployment-id"],
                  endpoint: config.directEndpoint ?? config["custom-host"],
                  region: config["aws-region"] ?? config["vertex-region"],
                  providerOptions: (
                      config.defaultOptions as { provider?: unknown }
                  )?.provider,
              }
            : null,
    };
});
