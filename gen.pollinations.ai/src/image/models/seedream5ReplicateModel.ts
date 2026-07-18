/**
 * ByteDance Seedream 5.0 Lite is now handled as a variant of the shared
 * Seedream Replicate model (bytedance/seedream-5-lite). This module remains a
 * thin re-export so the dispatch import in createAndReturnImages.ts stays
 * stable.
 */
export { callSeedream5API } from "./seedreamReplicateModel.ts";
