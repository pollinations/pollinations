import type {
    AudioFormat,
    ChatRouting,
    ChatRoutingCapability,
    Message,
    MessageContent,
    MessageContentPart,
    ModelInfo,
} from "@pollinations/sdk";

export const ROUTING_FIELDS = [
    "text",
    "web_search",
    "image_generation",
    "image_editing",
    "video",
    "audio",
] as const satisfies readonly ChatRoutingCapability[];

export type RoutingSelection = Record<ChatRoutingCapability, string | null>;

export const AUTO_ROUTING: RoutingSelection = {
    text: null,
    web_search: null,
    image_generation: null,
    image_editing: null,
    video: null,
    audio: null,
};

export interface RoutingChoice {
    id: string;
    title: string;
    description?: string;
}

export type ChatAttachmentKind = "image" | "video" | "audio" | "file";

export interface RenderedMedia {
    kind: Exclude<ChatAttachmentKind, "file">;
    url: string;
    label?: string;
}

export type ChatMessageStatus =
    | "complete"
    | "streaming"
    | "cancelled"
    | "error";

export interface ChatMessageState {
    id: string;
    role: "user" | "assistant";
    content: MessageContent;
    status: ChatMessageStatus;
    error?: string;
}

interface FileDescriptor {
    name: string;
    type: string;
}

const FILE_EXTENSIONS: Record<Exclude<ChatAttachmentKind, "file">, Set<string>> = {
    image: new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]),
    video: new Set(["m4v", "mov", "mp4", "webm"]),
    audio: new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"]),
};

const AUDIO_FORMATS: Record<string, AudioFormat> = {
    "audio/flac": "flac",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/opus": "opus",
    "audio/pcm": "pcm16",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    flac: "flac",
    mp3: "mp3",
    opus: "opus",
    pcm: "pcm16",
    pcm16: "pcm16",
    wav: "wav",
};

function normalizedValues(values: readonly string[] | undefined): Set<string> {
    return new Set(values?.map((value) => value.toLowerCase()) ?? []);
}

function modelId(model: ModelInfo): string | null {
    const id = (model.id ?? model.name).trim();
    return id.length > 0 ? id : null;
}

export function supportsRoutingField(
    model: ModelInfo,
    field: ChatRoutingCapability,
): boolean {
    const category = model.category?.toLowerCase();
    const inputs = normalizedValues(model.input_modalities);
    const outputs = normalizedValues(model.output_modalities);
    const capabilities = normalizedValues(model.capabilities);
    const hasTextInput = inputs.has("text");

    switch (field) {
        case "text":
            return category === "text" && hasTextInput && outputs.has("text");
        case "web_search":
            return (
                category === "text" &&
                hasTextInput &&
                outputs.has("text") &&
                capabilities.has("web_search")
            );
        case "image_generation":
            return category === "image" && hasTextInput && outputs.has("image");
        case "image_editing":
            return (
                category === "image" &&
                hasTextInput &&
                inputs.has("image") &&
                outputs.has("image")
            );
        case "video":
            return category === "video" && hasTextInput && outputs.has("video");
        case "audio":
            return category === "audio" && hasTextInput && outputs.has("audio");
        default:
            return false;
    }
}

export function routingChoices(
    models: ModelInfo[],
    allowedModelIds: ReadonlySet<string>,
    field: ChatRoutingCapability,
): RoutingChoice[] {
    return models
        .flatMap((model): RoutingChoice[] => {
            const id = modelId(model);
            if (
                !id ||
                id === "floret" ||
                model.community === true ||
                !allowedModelIds.has(id) ||
                !supportsRoutingField(model, field)
            ) {
                return [];
            }
            return [
                {
                    id,
                    title: model.title ?? model.name,
                    description: model.description,
                },
            ];
        })
        .sort(
            (left, right) =>
                left.title.localeCompare(right.title) ||
                left.id.localeCompare(right.id),
        );
}

export function compactRouting(
    selection: RoutingSelection,
): ChatRouting | undefined {
    const routing: ChatRouting = {};
    for (const field of ROUTING_FIELDS) {
        const model = selection[field]?.trim();
        if (model) routing[field] = model;
    }
    return Object.keys(routing).length > 0 ? routing : undefined;
}

function extension(name: string): string {
    return name.split(".").pop()?.toLowerCase() ?? "";
}

export function fileKind(file: FileDescriptor): ChatAttachmentKind {
    const mimeFamily = file.type.toLowerCase().split("/", 1)[0];
    if (mimeFamily === "image" || mimeFamily === "video" || mimeFamily === "audio") {
        return mimeFamily;
    }

    const fileExtension = extension(file.name);
    for (const [kind, extensions] of Object.entries(FILE_EXTENSIONS)) {
        if (extensions.has(fileExtension)) return kind as ChatAttachmentKind;
    }
    return "file";
}

export function audioFormat(file: FileDescriptor): AudioFormat | null {
    return (
        AUDIO_FORMATS[file.type.toLowerCase()] ??
        AUDIO_FORMATS[extension(file.name)] ??
        null
    );
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + chunkSize),
        );
    }
    return btoa(binary);
}

export function buildUserContent(
    text: string,
    parts: MessageContentPart[],
): MessageContent {
    const trimmedText = text.trim();
    if (parts.length === 0) return trimmedText;
    return [
        ...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
        ...parts,
    ];
}

export function conversationForRequest(
    messages: ChatMessageState[],
): Message[] {
    return messages.flatMap((message): Message[] => {
        const text =
            typeof message.content === "string" ? message.content.trim() : "";
        const include =
            message.status === "complete" ||
            (message.status === "cancelled" && text.length > 0);
        return include
            ? [{ role: message.role, content: message.content }]
            : [];
    });
}

function mediaKind(url: string, isImageSyntax: boolean): RenderedMedia["kind"] | null {
    if (isImageSyntax) return "image";
    try {
        const pathExtension = extension(new URL(url).pathname);
        for (const [kind, extensions] of Object.entries(FILE_EXTENSIONS)) {
            if (extensions.has(pathExtension)) return kind as RenderedMedia["kind"];
        }
    } catch {
        return null;
    }
    return null;
}

export function extractStreamedMedia(markdown: string): {
    markdown: string;
    media: RenderedMedia[];
} {
    const media: RenderedMedia[] = [];
    const seen = new Set<string>();
    const linkPattern = /(!?)\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;
    const displayMarkdown = markdown.replace(
        linkPattern,
        (source, imageMarker: string, label: string, url: string) => {
            const kind = mediaKind(url, imageMarker === "!");
            if (!kind) return source;
            if (!seen.has(url)) {
                seen.add(url);
                media.push({ kind, url, label: label || undefined });
            }
            return "";
        },
    );

    return {
        markdown: displayMarkdown.replace(/\n{3,}/g, "\n\n").trim(),
        media,
    };
}
