/**
 * Migration response for authenticated callers of the legacy text service.
 *
 * Authenticated requests (API token or registered referrer) are no longer
 * served by text.pollinations.ai. They get an explicit, non-cacheable error
 * that points to enter.pollinations.ai. It is deliberately NOT shaped like a
 * chat completion, so clients cannot mistake it for model output and the
 * shared cache never stores it as a successful answer.
 */

export const MIGRATION_URL = "https://enter.pollinations.ai";
export const MIGRATION_ERROR_CODE = "legacy_auth_migration_required";
export const MIGRATION_STATUS = 403;

const MIGRATION_MESSAGE =
    "Authenticated requests are no longer served by the legacy text API (text.pollinations.ai). " +
    `Please migrate to ${MIGRATION_URL} for access to all the latest models. ` +
    "Anonymous requests to text.pollinations.ai are not affected.";

/**
 * Machine-readable migration error. Keeps the legacy error shape
 * (`error` + `status`) and adds a stable `code` and the migration URL.
 */
export function buildMigrationError() {
    return {
        error: MIGRATION_MESSAGE,
        status: MIGRATION_STATUS,
        code: MIGRATION_ERROR_CODE,
        migration_url: MIGRATION_URL,
    };
}

/**
 * Send the migration response to an authenticated legacy caller.
 *
 * - Streaming requests keep the SSE framing: one `data:` event carrying the
 *   error object, then `data: [DONE]`, so stream readers stop cleanly.
 * - Non-streaming requests (GET and POST) get the JSON error, like every
 *   other legacy error response.
 * Both use a non-2xx status and `Cache-Control: private, no-store`.
 *
 * @param {Object} res - Express response object
 * @param {Object} requestData - Request data including the stream flag
 */
export function sendLegacyAuthMigrationResponse(res, requestData = {}) {
    const body = buildMigrationError();
    res.status(MIGRATION_STATUS);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Pollinations-Migration", MIGRATION_URL);

    if (requestData?.stream) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.write(`data: ${JSON.stringify(body)}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
    }

    return res.json(body);
}
