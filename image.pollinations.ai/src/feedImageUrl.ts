// Query parameters that carry an API key: the public feed must never show them
const CREDENTIAL_NAMES =
    /^(token|key|api_key|apikey|access_token|auth|authorization)$/i;
const KEY_VALUE = /^(sk|pk)_/;

const decode = (part: string) => {
    try {
        return decodeURIComponent(part.replace(/\+/g, " "));
    } catch {
        return part;
    }
};

/** The image URL shown on the public feed: the request URL without credential parameters */
export function feedImageURL(requestUrl: string): string {
    const at = requestUrl.indexOf("?");
    if (at === -1) return `https://image.pollinations.ai${requestUrl}`;
    const kept = requestUrl
        .slice(at + 1)
        .split("&")
        .filter((pair) => {
            const [name, value = ""] = pair.split("=");
            return (
                !CREDENTIAL_NAMES.test(decode(name)) &&
                !KEY_VALUE.test(decode(value))
            );
        });
    const query = kept.length ? `?${kept.join("&")}` : "";
    return `https://image.pollinations.ai${requestUrl.slice(0, at)}${query}`;
}
