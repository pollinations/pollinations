/**
 * Migration pointers for the legacy text.pollinations.ai and
 * image.pollinations.ai APIs.
 *
 * Every legacy response (success, cache hit or error) carries the same
 * machine-readable headers so clients and tooling can find the current Gen
 * API without parsing prose. Kept dependency-free so the Node origins and the
 * Cloudflare cache Workers can share it.
 */

export const GEN_DOCS_URL = "https://gen.pollinations.ai/docs";

export const MIGRATION_GUIDE_URL =
    "https://github.com/pollinations/pollinations/blob/master/LEGACY_MIGRATION.md";

export const MIGRATION_HEADER = "X-Pollinations-Migration";
export const DOCS_HEADER = "X-Pollinations-Docs";
export const SIGNUP_HEADER = "X-Pollinations-Signup";

export const MIGRATION_EXPOSED_HEADERS = [
    MIGRATION_HEADER,
    DOCS_HEADER,
    SIGNUP_HEADER,
    "Link",
];

/**
 * @param {"text" | "image"} service
 * @returns {string} Enter landing link tagged with the legacy source
 */
export function signupUrl(service) {
    return `https://enter.pollinations.ai/?ref=${service}`;
}

/**
 * Link header value pointing at the migration guide and the Gen docs.
 * `deprecation` is the RFC 9745 relation; `successor-version` is RFC 5829.
 */
export const MIGRATION_LINK = [
    `<${MIGRATION_GUIDE_URL}>; rel="deprecation"; type="text/html"`,
    `<${GEN_DOCS_URL}>; rel="successor-version"`,
].join(", ");

/**
 * @param {"text" | "image"} service
 * @returns {Record<string, string>} headers to add to every legacy response
 */
export function migrationHeaders(service) {
    return {
        [MIGRATION_HEADER]: MIGRATION_GUIDE_URL,
        [DOCS_HEADER]: GEN_DOCS_URL,
        [SIGNUP_HEADER]: signupUrl(service),
    };
}

/**
 * @param {"text" | "image"} service
 * @returns {{guide: string, docs: string, signup: string}} JSON body field
 */
export function migrationInfo(service) {
    return {
        guide: MIGRATION_GUIDE_URL,
        docs: GEN_DOCS_URL,
        signup: signupUrl(service),
    };
}

/**
 * Append a header value without dropping what is already there.
 * @param {string | null | undefined} existing
 * @param {string} value
 */
export function appendHeaderValue(existing, value) {
    if (!existing) return value;
    if (existing.includes(value)) return existing;
    return `${existing}, ${value}`;
}

/**
 * Add migration headers to a Fetch API Headers object (cache Workers).
 * Keeps any existing Link values (e.g. attribution) and widens
 * Access-Control-Expose-Headers so browser clients can read them.
 * @param {Headers} headers
 * @param {"text" | "image"} service
 */
export function addMigrationHeaders(headers, service) {
    for (const [name, value] of Object.entries(migrationHeaders(service))) {
        headers.set(name, value);
    }
    headers.set("Link", appendHeaderValue(headers.get("Link"), MIGRATION_LINK));

    const exposed = new Set(
        (headers.get("Access-Control-Expose-Headers") || "")
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
    );
    for (const name of MIGRATION_EXPOSED_HEADERS) exposed.add(name);
    headers.set("Access-Control-Expose-Headers", Array.from(exposed).join(", "));
}

/**
 * Short plain-text migration guide served at the legacy text root.
 * Mirrors LEGACY_MIGRATION.md.
 */
export const MIGRATION_GUIDE_TEXT = `Pollinations legacy API -> Gen API migration
=============================================

The legacy hosts text.pollinations.ai and image.pollinations.ai keep working
for existing anonymous callers. New features, models and authenticated use are
on https://gen.pollinations.ai.

Docs:        ${GEN_DOCS_URL}
Full guide:  ${MIGRATION_GUIDE_URL}
Get a key:   https://enter.pollinations.ai/?ref=text (text) or https://enter.pollinations.ai/?ref=image (image)

Route by route
--------------
GET  https://text.pollinations.ai/{prompt}          -> GET  https://gen.pollinations.ai/text/{prompt}
POST https://text.pollinations.ai/  (messages)      -> POST https://gen.pollinations.ai/text
POST https://text.pollinations.ai/openai            -> POST https://gen.pollinations.ai/v1/chat/completions
POST https://text.pollinations.ai/v1/chat/completions -> POST https://gen.pollinations.ai/v1/chat/completions
GET  https://text.pollinations.ai/models            -> GET  https://gen.pollinations.ai/text/models
GET  https://image.pollinations.ai/prompt/{prompt}  -> GET  https://gen.pollinations.ai/image/{prompt}
GET  https://image.pollinations.ai/models           -> GET  https://gen.pollinations.ai/image/models

Authentication
--------------
Legacy: anonymous, or ?token= / referrer.
Gen: an API key from https://enter.pollinations.ai/keys
  - server side: Authorization: Bearer sk_...
  - GET image/text URLs that cannot set headers: ?key=...
  - browser and mobile apps: use a pk_ app key with "Sign in with Pollinations"
    (OAuth) so each user brings their own key; never ship an sk_ key.

Models
------
Gen uses canonical model IDs (for example openai/gpt-5.4-nano or
black-forest-labs/flux.1-schnell). Legacy names such as "openai" and "flux"
are accepted as aliases. List them with /text/models and /image/models.
The Gen image default is tongyi-mai/z-image-turbo, so pass model=flux if you
relied on the legacy default.

Examples
--------
curl "https://gen.pollinations.ai/text/hello?key=YOUR_KEY"
curl https://gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"openai","messages":[{"role":"user","content":"hello"}]}'
<img src="https://gen.pollinations.ai/image/a%20cat?model=flux&key=YOUR_PK_KEY">
`;
