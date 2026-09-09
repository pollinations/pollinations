/**
 * Publishable BYOP app key for the site's own playground. Safe client-side —
 * `pk_` keys can only start an authorize flow; spending is always against the
 * signed-in user's own wallet.
 *
 * Registered redirect URIs: http://localhost/play (any port),
 * https://staging.pollinations.ai/play, https://pollinations.ai/play and
 * https://pollinations-ai-website-v2.elliot-b6e.workers.dev/play.
 */
// Public OAuth client identifier, registered only in staging.
const sandboxAppKey = "pk_wKunHXbBCNCgvFyy";
export const SANDBOX_TOP_UP =
    (import.meta.env.DEV || import.meta.env.MODE === "website-v2") &&
    !!sandboxAppKey;
export const POLLI_APP_KEY = SANDBOX_TOP_UP
    ? sandboxAppKey
    : "pk_5F0qxjbCjlgBODHa";
export const ENTER_URL = SANDBOX_TOP_UP
    ? "https://staging.enter.pollinations.ai"
    : "https://enter.pollinations.ai";
