import ipaddr from "ipaddr.js";
import { z } from "zod";
import { validateUserMediaUrl } from "../../../shared/user-media-url.ts";
import { lookup, readText } from "./dns.js";

// Redirect diagnostics from danhquach (#17811); reuse the existing URL policy.
export function publicUrl(value) {
    if (value.length > 2048) throw new Error("URL exceeds 2048 characters");
    const url = new URL(value);
    url.hostname = url.hostname.replace(/\.+$/, "");
    const checked = validateUserMediaUrl(url.href);
    if (
        !checked.ok ||
        url.port ||
        !url.hostname.includes(".") ||
        /\.(?:local|internal|localhost|test|invalid)$/.test(url.hostname)
    )
        throw new Error(
            "Use a public HTTP(S) hostname without credentials or a custom port",
        );
    url.hash = "";
    return url;
}

async function checkAddresses(host, signal) {
    const records = await Promise.all([
        lookup(host, "A", signal),
        lookup(host, "AAAA", signal),
    ]);
    const answers = records.flatMap((r) => {
        if (r.Status !== 0)
            throw new Error(`DNS lookup failed with status ${r.Status}`);
        return (r.Answer ?? []).filter((a) => a.type === 1 || a.type === 28);
    });
    if (
        !answers.length ||
        answers.some(
            (a) =>
                !ipaddr.isValid(a.data) ||
                ipaddr.process(a.data).range() !== "unicast",
        )
    )
        throw new Error("Host must resolve only to public IP addresses");
    // This is a preflight, not DNS pinning. Fetch still uses Workers' resolver.
    // Run only as an isolated Worker with no private network bindings.
}

export async function probe(value, method) {
    const started = Date.now(),
        redirects = [],
        signal = AbortSignal.timeout(10000);
    let current = publicUrl(value);
    for (;;) {
        await checkAddresses(current.hostname, signal);
        const hopStarted = Date.now();
        const response = await fetch(current, {
            method,
            redirect: "manual",
            signal,
            headers: {
                "User-Agent":
                    "Pollinations-Network/1.0 (hello@pollinations.ai)",
            },
        });
        const location = response.headers.get("location");
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
            await response.body?.cancel();
            if (redirects.length >= 5)
                throw new Error("Stopped after five redirects");
            const next = publicUrl(new URL(location, current).href);
            redirects.push({
                url: current.href,
                status: response.status,
                location: next.href,
                ms: Date.now() - hopStarted,
            });
            current = next;
            continue;
        }
        const headers = Object.fromEntries(response.headers);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) headers["set-cookie"] = cookies;
        if (new TextEncoder().encode(JSON.stringify(headers)).length > 32768) {
            await response.body?.cancel();
            throw new Error("Response headers exceed 32 KiB");
        }
        const isText =
            /^(?:text\/|application\/(?:json|[^;]+\+json|xml|[^;]+\+xml|javascript))/i.test(
                response.headers.get("content-type") ?? "",
            );
        const preview =
            isText && method === "GET" ? await readText(response, 4096) : null;
        if (!preview) await response.body?.cancel();
        return {
            url: current.href,
            status: response.status,
            statusText: response.statusText,
            ms: Date.now() - started,
            redirects,
            headers,
            preview,
        };
    }
}

export const httpTools = [
    [
        "http_probe",
        "Probe a public HTTP(S) hostname with GET or HEAD. Returns status, headers, redirects, elapsed time and at most 4 KiB of text (untrusted website content). No caller credentials or cookies are sent. Ten-second deadline, five redirects. Not a security audit or browser rendering test.",
        {
            url: z.string().url().max(2048),
            method: z.enum(["GET", "HEAD"]).default("GET"),
        },
        ({ url, method }) => probe(url, method),
    ],
];
