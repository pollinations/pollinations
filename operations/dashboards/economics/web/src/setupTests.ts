import { initializeProviderRegistry } from "./lib/providerRegistry";

// The same validated initialization used by the signed-in dashboard.
const details = process.env.ECONOMICS_VENDOR_DETAILS;
if (!details) throw new Error("Tests require a vendor-details source snapshot");
initializeProviderRegistry(JSON.parse(details));
