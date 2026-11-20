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
// An agent's reply is untrusted text, so only files on our own media host
// are fetched. Other links and images stay in the Markdown.
const MEDIA_HOST = "https://media.pollinations.ai/";
const HOSTED_MEDIA = /https:\/\/media\.pollinations\.ai\/[\w/-]+/g;

/** The media links a reply carries, in its text or its tool results, each once. */
export function replyMedia(items: AgentItem[]): string[] {
    const urls = new Set<string>();
    for (const item of items) {
        if (item.type === "text") {
            for (const [url] of item.text.matchAll(HOSTED_MEDIA)) urls.add(url);
            continue;
        }
        const output = item.result?.output as
            | { content?: { type?: string; uri?: string }[] }
            | undefined;
        for (const part of output?.content ?? []) {
            if (
                part.type === "resource_link" &&
                part.uri?.startsWith(MEDIA_HOST)
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
