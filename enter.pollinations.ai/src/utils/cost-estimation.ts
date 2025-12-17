import { PriceDefinition } from "@shared/registry/registry.ts";

/**
 * Estimate maximum possible cost for a request
 *
 * Used for pending spend reservations. We need to reserve funds BEFORE
 * knowing the actual cost, so we estimate conservatively (higher is safer).
 *
 * Think of it like a restaurant putting a hold on your credit card - they
 * estimate high to cover potential orders, then charge the actual amount later.
 *
 * @param priceDefinition - Price definition for the model
 * @returns Estimated maximum cost in pollen
 */
export function estimateMaxCost(priceDefinition: PriceDefinition): number {
    const {
        promptTextPrice = 0,
        promptCachedPrice = 0,
        promptAudioPrice = 0,
        promptImagePrice = 0,
        completionTextPrice = 0,
        completionReasoningPrice = 0,
        completionAudioPrice = 0,
        completionImagePrice = 0,
        completionVideoSecondsPrice = 0,
    } = priceDefinition;

    // Conservative estimates for different request types:
    // - Text: assume 4K prompt + 4K completion tokens (typical conversation)
    // - Image: assume 1 image output
    // - Audio: assume 60 seconds of audio
    // - Video: assume 10 seconds of video

    const MAX_TEXT_TOKENS = 4000;
    const MAX_IMAGE_COUNT = 1;
    const MAX_AUDIO_SECONDS = 60;
    const MAX_VIDEO_SECONDS = 10;

    // Calculate worst-case scenario across all modalities
    const estimatedCost =
        promptTextPrice * MAX_TEXT_TOKENS +
        promptCachedPrice * MAX_TEXT_TOKENS +
        promptAudioPrice * MAX_AUDIO_SECONDS +
        promptImagePrice * MAX_IMAGE_COUNT +
        completionTextPrice * MAX_TEXT_TOKENS +
        completionReasoningPrice * MAX_TEXT_TOKENS +
        completionAudioPrice * MAX_AUDIO_SECONDS +
        completionImagePrice * MAX_IMAGE_COUNT +
        completionVideoSecondsPrice * MAX_VIDEO_SECONDS;

    // Add 20% buffer for safety (better to over-reserve than under-reserve)
    return estimatedCost * 1.2;
}
