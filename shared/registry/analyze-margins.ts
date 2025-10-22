import { TEXT_COSTS } from "./text.ts";
import { IMAGE_COSTS } from "./image.ts";
import { getServices, getServiceDefinition } from "./registry.ts";

console.log("=== TEXT SERVICE MARGIN ANALYSIS ===\n");

for (const serviceId of getServices()) {
  const service = getServiceDefinition(serviceId);
  const modelId = service.modelId;
  const model = TEXT_COSTS[modelId as keyof typeof TEXT_COSTS];
  
  if (!model) {
    console.log(`${serviceId}: ERROR - Model ${modelId} not found`);
    continue;
  }
  
  const cost = model[0];
  const price = service.price[0];
  
  console.log(`${serviceId}:`);
  console.log(`  Model: ${modelId}`);
  
  if (price.promptTextTokens === 0 && price.completionTextTokens === 0) {
    console.log(`  Pricing: FREE (cost exists: ${cost.promptTextTokens > 0})`);
  } else if (price === cost) {
    console.log(`  Pricing: COST-AS-PRICE (direct reference)`);
  } else {
    const promptMargin = cost.promptTextTokens ? (price.promptTextTokens / cost.promptTextTokens) : 0;
    const completionMargin = cost.completionTextTokens ? (price.completionTextTokens / cost.completionTextTokens) : 0;
    console.log(`  Prompt: ${promptMargin.toFixed(2)}x (cost: ${cost.promptTextTokens}, price: ${price.promptTextTokens})`);
    console.log(`  Completion: ${completionMargin.toFixed(2)}x (cost: ${cost.completionTextTokens}, price: ${price.completionTextTokens})`);
  }
  console.log();
}

console.log("\n=== IMAGE SERVICE MARGIN ANALYSIS ===\n");

// Filter to only image services (those with modelId in IMAGE_COSTS)
const imageServices = getServices().filter(serviceId => {
  const service = getServiceDefinition(serviceId);
  return service.modelId in IMAGE_COSTS;
});

for (const serviceId of imageServices) {
  const service = getServiceDefinition(serviceId);
  const modelId = service.modelId;
  const model = IMAGE_COSTS[modelId as keyof typeof IMAGE_COSTS];
  
  if (!model) {
    console.log(`${serviceId}: ERROR - Model ${modelId} not found`);
    continue;
  }
  
  const cost = model[0];
  const price = service.price[0];
  
  console.log(`${serviceId}:`);
  console.log(`  Model: ${modelId}`);
  
  if (price.completionImageTokens === 0) {
    console.log(`  Pricing: FREE (cost: ${cost.completionImageTokens})`);
  } else if (price === cost) {
    console.log(`  Pricing: COST-AS-PRICE (direct reference)`);
  } else {
    const margin = cost.completionImageTokens ? (price.completionImageTokens / cost.completionImageTokens) : 0;
    console.log(`  Margin: ${margin.toFixed(2)}x (cost: ${cost.completionImageTokens}, price: ${price.completionImageTokens})`);
  }
  console.log();
}
