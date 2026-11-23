/** One server-run tool call, and its result when the agent reports one. */
export type AgentToolCall = {
    type: "tool";
    callId: string;
    /** The exact name the API sent, such as mcp__pollinations__generateAudio. */
    name: string;
    arguments: unknown;
    result?: { output: unknown; isError?: boolean };
};

/** A file attached to a prompt, once uploaded: images, audio and video. */
export type AgentAttachment = {
    url: string;
    mediaType: string;
    filename: string;
};

export type AgentItem = AgentToolCall | { type: "text"; text: string };

export type AgentTurn = {
    id: string;
    prompt: string;
    /** Files attached to the prompt, and their links once uploaded. */
    files?: File[];
    attachments?: AgentAttachment[];
    /** Tool calls and text, in the order the agent sent them. */
    items: AgentItem[];
    status: "running" | "done" | "stopped" | "interrupted";
    /** Why the reply was interrupted, when the API said. */
    error?: string;
    /** A finished reply's own items, sent back unchanged on later turns. */
    output?: unknown[];
};

/**
 * A user turn as chat parts: the text first, then each attachment. An agent
 * sees an image but not its link, so with `linkImages` the image is followed
 * by a plain file part that gives its tools the link.
 */
export function userParts(turn: AgentTurn, linkImages = false) {
    return [
        { type: "text", text: turn.prompt },
        ...(turn.attachments ?? []).flatMap(({ url, mediaType, filename }) => [
            { type: "file", url, mediaType, filename },
            ...(linkImages && mediaType.startsWith("image/")
                ? [{ type: "file", url, filename }]
                : []),
        ]),
    ];
}

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

const MARKDOWN_LINK = /(!?)\[[^\]]*\]\(<?([^)\s>]+)>?\)/g;
// An agent's reply is untrusted text, so only files on our own media host
// are fetched. Other links and images stay in the text, as links.
const MEDIA_HOST = "https://media.pollinations.ai/";
const HOSTED_MEDIA = /https:\/\/media\.pollinations\.ai\/[^\s()<>[\]"'`]+/g;

/**
 * The media links a reply carries, each once. A tool result names its files
 * outright; text is read only once it is complete, because a link that is
 * still arriving is a different, wrong link.
 */
export function replyMedia(
    items: AgentItem[],
    textComplete: boolean,
): string[] {
    const urls = new Set<string>();
    for (const item of items) {
        if (item.type === "text") {
            if (!textComplete) continue;
            for (const [url] of item.text.matchAll(HOSTED_MEDIA))
                urls.add(url.replace(/[.,;:!?*_]+$/, ""));
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
