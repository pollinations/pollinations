/**
 * Publishable BYOP app key for the site's own playground. Safe client-side —
 * `pk_` keys can only start an authorize flow; spending is always against the
 * signed-in user's own wallet.
 *
 * Registered redirect URIs: http://localhost/play (any port) and
 * https://staging.pollinations.ai/play — add the production hosts to the same
 * key in Enter before the production cutover.
 */
export const POLLI_APP_KEY = "pk_5F0qxjbCjlgBODHa";
export const ENTER_URL = "https://enter.pollinations.ai";
