import { createMiddleware } from "hono/factory";
import { asksForSexualContentWithMinors } from "../child-safety.ts";
import { logFailure } from "../origin.ts";

/** The prompt generate() would make, or undefined for a malformed % */
function promptOf(url: URL) {
    try {
        return decodeURIComponent(url.pathname.split("/prompt/")[1] ?? "");
    } catch {
        return undefined;
    }
}

/**
 * The 400 for a refused prompt, or undefined to go on. It comes before the
 * cache, so neither a new nor a stored image is answered.
 */
export function childSafetyRefusal(url: URL, route: string) {
    const prompt = promptOf(url);
    if (!prompt || !asksForSexualContentWithMinors(prompt)) return;
    logFailure(route, { error: "child_safety" });
    const body = {
        status: 400,
        success: false,
        error: {
            code: "CONTENT_BLOCKED",
            message:
                "This prompt can't be generated: sexual content involving minors is never allowed.",
            timestamp: new Date().toISOString(),
        },
    };
    return new Response(JSON.stringify(body), {
        status: 400,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

export const childSafety = createMiddleware(
    async (c, next) =>
        childSafetyRefusal(new URL(c.req.url), "/prompt/:prompt") ?? next(),
);
