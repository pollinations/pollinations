export function getProviderNameFromModel(modelName: string): string {
  if (!modelName) return "Unknown";
  const lowerModel = modelName.toLowerCase();
  if (lowerModel.includes("flux")) return "io.net";
  if (lowerModel.includes("kontext")) return "io.net";
  if (lowerModel.includes("nanobanana")) return "google";
  if (lowerModel.includes("seedream")) return "byteplus";
  if (lowerModel.includes("turbo")) return "scaleway";
  if (lowerModel.includes("gptimage")) return "azure";
  return "Unknown";
}
