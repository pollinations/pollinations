/**
 * Legacy text API migration helpers: headers on every response and the
 * plain-text guide served at the root. Only depends on the dependency-free
 * shared/legacy-migration.js so it can be tested without the full server.
 */
import {
    GEN_DOCS_URL,
    MIGRATION_EXPOSED_HEADERS,
    MIGRATION_GUIDE_TEXT,
    MIGRATION_LINK,
    appendHeaderValue,
    migrationHeaders,
    migrationInfo,
    signupUrl,
} from "../shared/legacy-migration.js";

export const CORS_EXPOSED_HEADERS = [
    "Payment-Required",
    "Payment-Response",
    ...MIGRATION_EXPOSED_HEADERS,
];

/** Express middleware: machine-readable migration pointers, errors included. */
export function legacyMigrationHeaders(req, res, next) {
    for (const [name, value] of Object.entries(migrationHeaders("text"))) {
        res.setHeader(name, value);
    }
    res.setHeader("Link", appendHeaderValue(res.getHeader("Link"), MIGRATION_LINK));
    next();
}

/** GET / handler: route-by-route migration guide. */
export function sendMigrationGuide(req, res) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(MIGRATION_GUIDE_TEXT);
}

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
