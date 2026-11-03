// An app's page as facts: its title, and the lines of the page and its own
// hosted scripts that mention Pollinations (exa cannot read hosted .js). A
// Worker cannot reach private networks; the hostname check also keeps a local
// run off them.
import { isBlockedHostname } from "../../../../shared/community-endpoint-urls.ts";
import { redact } from "../checker.js";

const MENTION = /pollinations\.ai|@pollinations\/sdk/gi;
const MAX_BYTES = 600_000;

async function fetchText(url) {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
        if (!/^https?:$/.test(current.protocol) || current.username)
            throw new Error("not a public http(s) URL");
        if (isBlockedHostname(current.hostname))
            throw new Error("not a public host");
        const res = await fetch(current, {
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
            headers: { "user-agent": "pollinations-runner" },
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
            res.body?.cancel();
            current = new URL(location, current);
            continue;
        }
        const text = (await res.text()).slice(0, MAX_BYTES);
        return { url: current.href, status: res.status, text };
    }
    throw new Error("too many redirects");
}

// Each Pollinations mention with the code around it, so the agent sees what
// the app does with it.
export function snippets(text, max = 12) {
    const found = new Set();
    for (const match of text.matchAll(MENTION)) {
        const start = Math.max(0, match.index - 80);
        found.add(
            redact(text.slice(start, match.index + 80).replace(/\s+/g, " ")),
        );
        if (found.size === max) break;
    }
    return [...found];
}

export async function pageFacts(appUrl, nextId) {
    let page;
    try {
        page = await fetchText(appUrl);
    } catch (error) {
        return [
            { id: nextId(), kind: "page", url: appUrl, error: error.message },
        ];
    }
    const facts = [
        {
            id: nextId(),
            kind: "page",
            url: page.url,
            status: page.status,
            title: page.text.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? "",
            mentions: snippets(page.text),
        },
    ];
    const origin = new URL(page.url).origin;
    const scripts = [...page.text.matchAll(/<script[^>]+src=["']([^"']+)/gi)]
        .map((m) => new URL(m[1], page.url))
        .filter((src) => src.origin === origin)
        .slice(0, 5);
    for (const src of scripts) {
        try {
            const mentions = snippets((await fetchText(src.href)).text);
            if (mentions.length)
                facts.push({
                    id: nextId(),
                    kind: "script",
                    url: src.href,
                    mentions,
                });
        } catch (error) {
            facts.push({
                id: nextId(),
                kind: "script",
                url: src.href,
                error: error.message,
            });
        }
    }
    return facts;
}
