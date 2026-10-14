// What Free API Classic tells a caller it did not answer: one sentence each,
// the same in both Workers. ?ref=classic lets enter count the visits.
import { PAGE } from "./free-limit-page.js";

const ENTER = "https://enter.pollinations.ai/?ref=classic";

const JSON_TYPE = "application/json; charset=utf-8";

/** The free limit's message for each kind of caller: [Content-Type, body] */
const FREE_LIMIT = {
    image: (every, wait) => [
        JSON_TYPE,
        JSON.stringify({
            error: `Free limit: 1 image every ${every} seconds. Try again in ${wait} s, or get unlimited images with a pollen key at ${ENTER}`,
        }),
    ],
    // Apps print a text reply as it is
    text: (every, wait) => [
        "text/plain; charset=utf-8",
        `Free limit: 1 reply every ${every} seconds. Try again in ${wait} s, or get unlimited replies at enter.pollinations.ai`,
    ],
    // The error shape OpenAI SDKs read and show
    openai: (every, wait) => [
        JSON_TYPE,
        JSON.stringify({
            error: {
                message: `Free limit: 1 request every ${every} seconds. Try again in ${wait} s, or use a pollen key from ${ENTER} with base URL https://gen.pollinations.ai/v1`,
            },
        }),
    ],
};

/** The free limit's page for a browser, built by free-limit-page/render.js */
function page(kind, every, wait) {
    const [item, items] =
        kind === "image" ? ["image", "images"] : ["reply", "replies"];
    const clock = `0:${String(wait).padStart(2, "0")}`;
    const values = { item, items, every, wait, clock };
    return [
        "text/html; charset=utf-8",
        PAGE.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]),
    ];
}

/**
 * The paywall's 402 for a caller that sent no payment, with the free limit's
 * page for a browser, or its message in place of the empty {}, and a
 * Retry-After. PAYMENT-REQUIRED stays as it was: x402 clients read only that
 * header.
 * @param {"image" | "text" | "openai"} kind
 * @param {number} until when the IP's next free request may start
 */
export function explainFreeLimit(request, response, kind, intervalMs, until) {
    const paying =
        request.headers.has("payment-signature") ||
        request.headers.has("x-payment");
    const type = response.headers.get("content-type") ?? "";
    const browser = type.startsWith("text/html");
    if (
        response.status !== 402 ||
        paying ||
        !(browser || type.startsWith("application/json"))
    )
        return response;
    const wait = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    const every = intervalMs / 1000;
    const [contentType, body] = browser
        ? page(kind, every, wait)
        : FREE_LIMIT[kind](every, wait);
    const headers = new Headers(response.headers);
    // Express's weak ETag and the length were for the paywall's own body
    headers.delete("ETag");
    headers.delete("Content-Length");
    headers.set("Content-Type", contentType);
    headers.set("Retry-After", String(wait));
    return new Response(body, { status: 402, headers });
}
