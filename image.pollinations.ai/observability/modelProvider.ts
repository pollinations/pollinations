export function getProviderNameFromModel(modelName: string): string {
  if (!modelName) return "Unknown";
  const lowerModel = modelName.toLowerCase();
  if (lowerModel.includes("flux")) return "Black Forest Labs";
  if (lowerModel.includes("dalle") || lowerModel.includes("dall-e")) return "OpenAI";
  if (lowerModel.includes("midjourney")) return "Midjourney";
  if (lowerModel.includes("stable") || lowerModel.includes("sd")) return "Stability AI";
  if (lowerModel.includes("playground")) return "Playground AI";
  return "Unknown";
}
