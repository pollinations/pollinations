/**
 * Legacy text API migration helpers used by the text cache Worker: the Gen
 * pointers of every JSON error body. Only depends on the dependency-free
 * shared/legacy-migration.js.
 */
import {
    GEN_DOCS_URL,
    migrationInfo,
    signupUrl,
} from "../shared/legacy-migration.js";

export const DEPRECATION_NOTICE = `NOTE: The Pollinations legacy text API is being deprecated for authenticated users. Please migrate to https://gen.pollinations.ai (docs: ${GEN_DOCS_URL}, key: ${signupUrl("text")}). Anonymous requests to text.pollinations.ai are NOT affected.`;

/** Fields added to every JSON error body. */
export function migrationErrorFields() {
    return {
        deprecation_notice: DEPRECATION_NOTICE,
        migration: migrationInfo("text"),
    };
}

/** Error text for an unknown model. */
export function modelNotFoundMessage(model) {
    return `Model not found: ${model}. This is our legacy API - see https://gen.pollinations.ai/text/models for current models and ${signupUrl("text")} for a key`;
}
