/** One server-run tool call, and its result when the agent reports one. */
export type AgentToolCall = {
    type: "tool";
    callId: string;
    /** The exact name the API sent, such as mcp__pollinations__generateAudio. */
    name: string;
    arguments: unknown;
    result?: { output: unknown; isError?: boolean };
};

export type AgentItem = AgentToolCall | { type: "text"; text: string };

export type AgentTurn = {
    id: string;
    prompt: string;
    /** Images attached to the prompt, and their links once uploaded. */
    files?: File[];
    images?: { url: string; mediaType: string }[];
    /** Tool calls and text, in the order the agent sent them. */
    items: AgentItem[];
    status: "running" | "done" | "stopped" | "interrupted";
    /** Why the reply was interrupted, when the API said. */
    error?: string;
    /** A finished reply's own items, sent back unchanged on later turns. */
    output?: unknown[];
};

export function replyText(turn: AgentTurn): string {
    return turn.items
        .flatMap((item) => (item.type === "text" ? [item.text] : []))
        .join("\n\n");
}

/** "Generate audio" from mcp__pollinations__generateAudio or generate_audio. */
export function toolLabel(name: string): string {
    const words = name
        .replace(/^mcp__.+?__/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase();
    return words ? words[0].toUpperCase() + words.slice(1) : name;
}

const MARKDOWN_LINK = /(!?)\[[^\]]*\]\(([^)\s]+)\)/g;
const HOSTED_MEDIA = /https:\/\/media\.pollinations\.ai\/[\w/-]+/g;
// An agent's reply is untrusted text: only https and same-site paths are
// fetched or linked. Anything else stays in the Markdown, which drops it.
const SAFE_LINK = /^(https:\/\/|\/(?!\/))/;

/**
 * The links a reply shows as media, each once: embedded images, files on our
 * media host, and media links in tool results.
 */
export function replyMedia(items: AgentItem[]): string[] {
    const urls = new Set<string>();
    for (const item of items) {
        if (item.type === "text") {
            for (const [, image, url] of item.text.matchAll(MARKDOWN_LINK))
                if (image && SAFE_LINK.test(url)) urls.add(url);
            for (const [url] of item.text.matchAll(HOSTED_MEDIA)) urls.add(url);
            continue;
        }
        const output = item.result?.output as
            | { content?: { type?: string; uri?: string; mimeType?: string }[] }
            | undefined;
        for (const part of output?.content ?? []) {
            if (
                part.type === "resource_link" &&
                part.uri &&
                SAFE_LINK.test(part.uri) &&
                /^(image|audio|video)\//.test(part.mimeType ?? "")
            )
                urls.add(part.uri);
        }
    }
    return [...urls];
}

/** The reply text without the Markdown that points at media shown below it. */
export function withoutMedia(text: string, media: string[]): string {
    return text
        .replace(MARKDOWN_LINK, (match, _image, url) =>
            media.includes(url) ? "" : match,
        )
        .trim();
}
