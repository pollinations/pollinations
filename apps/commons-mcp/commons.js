const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
    "Pollinations-Commons/0.1 (+https://pollinations.ai; hello@pollinations.ai)";
const MAX_BYTES = 512 * 1024;

// Asking for a scaled thumbnail makes imageinfo an expensive property, and the
// API then returns it for at most 50 files per request. The rest come back
// without imageinfo at all, which reads as "no licence, no size" rather than as
// a truncated page, so a caller that asks for 200 silently keeps 50.
export const MAX_PER_REQUEST = 50;

// Commons pre-renders a fixed set of thumbnail widths. Any other width is
// rendered on demand and rate limited far more aggressively, so a scripted
// caller that picks, say, 1600 gets minutes per image where 1280 takes about a
// second. Requests snap to the nearest of these at or above what was asked.
const STANDARD_WIDTHS = [320, 640, 800, 1024, 1280, 1920, 2560];

export function standardWidth(width) {
    return STANDARD_WIDTHS.find((w) => w >= width) ?? STANDARD_WIDTHS.at(-1);
}

/**
 * Whether a licence allows reuse, including commercial reuse, with credit.
 *
 * Match on LicenseShortName, never on UsageTerms: the usage terms of every
 * Creative Commons licence that requires credit begin "Creative Commons
 * Attribution", so a filter that looks for the word "attribution" throws away
 * the plain CC BY files, which are exactly the reusable ones.
 */
export function licenceKind(shortName) {
    const name = String(shortName ?? "")
        .trim()
        .toLowerCase();
    if (!name) return "unknown";
    if (/^(public domain|pd[- ]|cc0|cc-zero|no restrictions)/.test(name))
        return "free";
    if (/^cc by\b/.test(name))
        return /-(sa|nc|nd)\b/.test(name) ? "restricted" : "free";
    return "restricted";
}

function plain(html) {
    return String(html ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export async function query(params, signal = AbortSignal.timeout(15_000)) {
    const url = `${API}?${new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        ...params,
    })}`;
    const response = await fetch(url, {
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
        await response.body?.cancel();
        // Wikimedia answers a burst with 429 for a while after it stops, so the
        // useful advice is to wait rather than to retry straight away.
        throw new Error(
            response.status === 429
                ? "Wikimedia Commons rate limited this request; wait about a minute before asking again."
                : `Wikimedia Commons returned HTTP ${response.status}.`,
        );
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES)
        throw new Error("Commons response exceeds 512 KiB; lower limit.");
    const body = JSON.parse(text);
    if (body.error)
        throw new Error(
            `Commons API error ${body.error.code}: ${body.error.info}`,
        );
    return body;
}

/** One search result, with the credit line a reuser has to publish. */
export function describe(page) {
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    const shortName = plain(meta.LicenseShortName?.value);
    const author = plain(meta.Artist?.value) || "author not stated";
    const title = String(page.title ?? "").replace(/^File:/, "");
    return {
        title,
        page: info.descriptionurl ?? null,
        licence: shortName || "not stated",
        licenceKind: licenceKind(shortName),
        author,
        width: info.width ?? null,
        height: info.height ?? null,
        thumbnail: info.thumburl ?? null,
        thumbnailWidth: info.thumbwidth ?? null,
        // Ready to publish beside the image. Public-domain files do not require
        // it, but naming the source is good practice and costs nothing.
        credit: `${title} — ${author} — ${shortName || "licence not stated"}${
            info.descriptionurl ? ` — ${info.descriptionurl}` : ""
        }`,
    };
}

export const IMAGE_INFO = {
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|Artist|Credit|UsageTerms",
};
