/**
 * Headers that let gen record a Classic caller as it records its own API's
 * callers: the client IP, which gen keeps as a keyed hash and a subnet, and
 * the referrer. A referrer that is not printable ASCII of at most 2,048
 * characters is left out, so no value can make the gen request fail.
 * @param {Request} request the client's request
 * @param {string | null | undefined} referrer
 * @returns {Record<string, string>}
 */
export function callerHeaders(request, referrer) {
    const headers = {};
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers["CF-Connecting-IP"] = ip;
    if (referrer && /^[\x20-\x7e]{1,2048}$/.test(referrer)) {
        headers.Referer = referrer;
    }
    return headers;
}
