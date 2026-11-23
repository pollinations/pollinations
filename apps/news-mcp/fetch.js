import { readResponseText } from "../../shared/response-bytes.ts";
import { validateUserMediaUrl } from "../../shared/user-media-url.ts";

const MAX_BYTES = 512 * 1024;
const USER_AGENT =
    "Pollinations-News/0.1 (+https://pollinations.ai; hello@pollinations.ai)";

export function publicUrl(value) {
    const url = new URL(value);
    url.hostname = url.hostname.replace(/\.$/, "");
    const checked = validateUserMediaUrl(url.href);
    if (!checked.ok)
        throw new Error(
            "Use a public HTTP(S) URL without credentials or an IP address.",
        );
    return checked.url;
}

// This Worker has no private-network bindings. Revalidate every redirect and
// let Workers route strictly over the public Internet, as for media fetches.
export async function getText(value, signal = AbortSignal.timeout(10_000)) {
    let url = publicUrl(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
        const response = await fetch(url, {
            redirect: "manual",
            signal,
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json, application/atom+xml, application/rss+xml, text/xml",
            },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get("location");
            if (!location)
                throw new Error("Upstream redirect has no location.");
            url = publicUrl(new URL(location, url).href);
            continue;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(
                `${url.hostname} returned HTTP ${response.status}${response.status === 429 ? "; rate limited, try later" : ""}.`,
            );
        }
        try {
            return {
                text: await readResponseText(
                    response,
                    MAX_BYTES,
                    () => new Error("Upstream response exceeds 512 KiB."),
                ),
                url: url.href,
            };
        } finally {
            await response.body?.cancel();
        }
    }
    throw new Error("Upstream redirected more than three times.");
}

export async function getJson(url, signal) {
    const { text } = await getText(url, signal);
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            `${new URL(url).hostname} returned non-JSON: ${text.replace(/\s+/g, " ").slice(0, 200)}`,
        );
    }
}
