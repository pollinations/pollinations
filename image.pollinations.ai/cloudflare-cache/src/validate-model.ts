/**
 * Lightweight model name validator for telemetry
 * Mirrors backend validation logic from params.ts
 * Backend uses: z.literal(allowedModels).catch("flux")
 */

import { IMAGE_SERVICES } from "../../../shared/registry/image.ts";

// Build valid model set dynamically from registry (includes main names + aliases)
const VALID_IMAGE_MODELS = new Set<string>();

// Add all model names from registry
for (const modelName of Object.keys(IMAGE_SERVICES)) {
    VALID_IMAGE_MODELS.add(modelName.toLowerCase());
}

// Add all aliases from registry
for (const service of Object.values(IMAGE_SERVICES)) {
    if (service.aliases) {
        for (const alias of service.aliases) {
            VALID_IMAGE_MODELS.add(alias.toLowerCase());
        }
    }
}

/**
 * Validate and normalize a model name for telemetry
 * Matches backend fallback behavior: invalid models → "flux" (default)
 * Dynamically uses actual registry to stay in sync with backend
 * 
 * @param requestedModel - The model name from URL parameter
 * @returns Valid model name or "flux" (default) for invalid models
 */
export function validateModelName(requestedModel: string | null | undefined): string {
    if (!requestedModel) {
        return "flux"; // Backend default
    }
    
    // Normalize to lowercase for comparison
    const normalized = requestedModel.toLowerCase().trim();
    
    // Check if it's a valid model or alias
    if (VALID_IMAGE_MODELS.has(normalized)) {
        return normalized;
    }
    
    // Invalid model - return "flux" (backend default) to match actual generation
    return "flux";
}
