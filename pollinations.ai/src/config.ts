/**
 * Publishable BYOP app key for the site's own playground. Safe client-side —
 * `pk_` keys can only start an authorize flow; spending is always against the
 * signed-in user's own wallet.
 *
 * Registered redirect URIs: http://localhost/play (any port),
 * https://staging.pollinations.ai/play, https://pollinations.ai/play and
 * https://pollinations-ai-website-v2.elliot-b6e.workers.dev/play.
 */
export const POLLI_APP_KEY = "pk_5F0qxjbCjlgBODHa";
export const ENTER_URL = "https://enter.pollinations.ai";
export const API_BASE_URL = "https://gen.pollinations.ai";
