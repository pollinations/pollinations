// What the Classic API tells a caller it did not answer, in enter's formats:
// gen's error body for scripts and, for plain text, a notice worded as gen's
// text-balance-notice. ?ref=classic lets enter count the visits.
import { PAGE } from "./free-limit-page.js";

const ENTER = "https://enter.pollinations.ai/?ref=classic";
const JSON_TYPE = "application/json; charset=utf-8";
// One request past the free limit over x402: the price the paywalls of
// pay.js and pay.ts charge, and the price the free limit's page names
export const PRICE_USD = "0.01";

/** gen's error body (shared/error.ts on main) */
const genError = (status, code, message) =>
    JSON.stringify({
        status,
        success: false,
        error: {
            code,
            message,
            timestamp: new Date().toISOString(),
            fixUrl: ENTER,
        },
    });

const limitError = (item, every, wait) =>
    `Free limit reached: 1 ${item} every ${every} seconds per IP. Retry after ${wait}s, or get unlimited ${item === "image" ? "images" : "replies"} with a pollen key at ${ENTER}`;

// Apps print a plain text answer as it is, so it names the fix as gen's notice does
const limitNotice = (every, wait) =>
    `Free limit reached: 1 reply every ${every} seconds per IP. Please wait ${wait} seconds or [get unlimited replies](${ENTER}), then try again.\n\n` +
    "If you're using someone else's app, ask whoever runs it to switch to a pollen key.";

/** The free limit's page for a browser, built by screens/render.js */
function page(kind, every, wait) {
    const [item, items] =
        kind === "image" ? ["image", "images"] : ["reply", "replies"];
    const clock = `0:${String(wait).padStart(2, "0")}`;
    const values = { item, items, every, wait, clock, price: PRICE_USD };
    return PAGE.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
}

/**
 * The paywall's 402 for a caller that sent no payment, with an answer in place
 * of its empty {}: the free limit's page for a browser, the notice for a plain
 * text request, gen's error body for an image, OpenAI or JSON request. The 402
 * and PAYMENT-REQUIRED stay: x402 clients pay from that header.
 * @param {"image" | "text" | "json"} kind
 * @param {number} until when the IP's next free request may start
 */
export function explainFreeLimit(request, response, kind, intervalMs, until) {
    const paying =
        request.headers.has("payment-signature") ||
        request.headers.has("x-payment");
    const type = response.headers.get("content-type") ?? "";
    const browser = type.startsWith("text/html");
    // A paying script keeps the paywall's own JSON answer; a browser always
    // gets the page, as the paywall's own is empty
    if (
        response.status !== 402 ||
        (paying && !browser) ||
        !(browser || type.startsWith("application/json"))
    )
        return response;
    const wait = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    const every = intervalMs / 1000;
    const headers = new Headers(response.headers);
    // Express's weak ETag and the length were for the paywall's own body
    headers.delete("ETag");
    headers.delete("Content-Length");
    headers.set("Retry-After", String(wait));
    const answer = (contentType, body) => {
        headers.set("Content-Type", contentType);
        return new Response(body, { status: 402, headers });
    };

    if (browser)
        return answer("text/html; charset=utf-8", page(kind, every, wait));
    if (kind === "text")
        return answer("text/plain; charset=utf-8", limitNotice(every, wait));
    return answer(
        JSON_TYPE,
        genError(
            402,
            "FREE_LIMIT",
            limitError(kind === "image" ? "image" : "reply", every, wait),
        ),
    );
}

const RETRY_SECONDS = 10;
const CODES = {
    400: "BAD_REQUEST",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
};

/** An answer in gen's error body, with gen's code for its status */
export const genAnswer = (status, message, headers = {}) => ({
    status,
    headers: { "Content-Type": JSON_TYPE, ...headers },
    body: genError(status, CODES[status] ?? "BAD_REQUEST", message),
});

/**
 * A free generation gen could not make, answered as gen answers its own
 * failures: a busy or rate-limited gen gets a 503 that clients retry, any
 * other failure is ours, a 500. A request the caller can fix (gen's other
 * 4xx) gets undefined: the Worker passes gen's own refusal on.
 * @param {number} [genStatus] gen's status; none when the Worker itself failed
 */
export function failure(genStatus) {
    if (
        genStatus >= 400 &&
        genStatus < 500 &&
        ![401, 402, 403, 429].includes(genStatus)
    )
        return undefined;
    return genStatus === 429 || genStatus >= 500
        ? genAnswer(
              503,
              `The Classic API is at its limit right now. Retry after ${RETRY_SECONDS}s, or get full access to every model with a pollen key at ${ENTER}`,
              { "Retry-After": String(RETRY_SECONDS) },
          )
        : genAnswer(
              500,
              `Something went wrong on our side. Please try again, or use every model with a pollen key at ${ENTER}`,
          );
}

/** The Workers' refusals of a request the caller can fix */
export const REFUSED = {
    replyBusy: `Your previous request is still running. The Classic API answers 1 request at a time per IP. Wait for it to finish, or run requests in parallel with a pollen key at ${ENTER}`,
    imageBusy: `Your previous image is still being made. The Classic API makes 1 image at a time per IP. Wait for it to finish, or make images in parallel with a pollen key at ${ENTER}`,
    badMessages:
        "messages must be a list of {role, content} objects. See https://github.com/pollinations/pollinations/blob/master/APIDOCS.md",
    unknownModel: (model) =>
        `Model "${model}" isn't on the Classic API. Free models: https://text.pollinations.ai/models. Every model we offer is on ${ENTER}`,
    enterOnly: (model) =>
        `${model} isn't part of the Classic API. Use it with a pollen key at ${ENTER}`,
};
