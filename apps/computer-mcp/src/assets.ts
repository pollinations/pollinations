import type { AssetsClient, WorkspaceLike } from "@cloudflare/computer/assets";
// The media service's MediaUpload RPC entrypoint, narrowed to what this
// Worker calls. Declared here rather than imported: pulling the media
// source into this program makes tsc recurse through the shared R2 types.
export type MediaService = {
    upload(
        body: ReadableStream<Uint8Array>,
        input: { contentType: string; fileName?: string; size: number },
    ): Promise<{ id: string; url: string; contentType: string; size: number }>;
    get(id: string): Promise<Response | null>;
};

// Backs the in-shell `assets publish <path>` command with the Pollinations
// media service: the file is copied to media storage and its public URL is
// printed. The command's expiry argument is ignored; media keeps files for
// 30 days and refreshes that on every read.
export function createMediaAssets(
    workspace: WorkspaceLike,
    media: MediaService,
): AssetsClient {
    return {
        async share(path) {
            const { size } = await workspace.fs.stat(path);
            const body = await workspace.fs.readFile(path);
            const upload = await media.upload(body, {
                contentType: contentTypeFor(path),
                fileName: path.slice(path.lastIndexOf("/") + 1),
                size,
            });
            return upload.url;
        },
    };
}

const CONTENT_TYPES: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    zip: "application/zip",
};

function contentTypeFor(path: string): string {
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
