import mappings from "../../provider-registry.json";
import { initializeProviderRegistry } from "./lib/providerRegistry";

// Artificial definitions for public calculation and model-mapping tests, not a business catalog.
// Real account, category, lifecycle and contract checks run with the Drive source.
const definitions = {
    version: 1,
    providers: mappings.providers.map(({ id }) => ({
        id,
        label: `Test vendor: ${id}`,
        category: "compute",
        meteringBasis: "direct",
        connector: null,
        collectionMethod: null,
        monthlyReview: false,
        balanceTracking: false,
    })),
};
initializeProviderRegistry(definitions);
