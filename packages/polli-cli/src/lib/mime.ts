import { extname } from "node:path";

const MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

/** Guess a file's MIME type from its extension. Servers that validate a
 * multipart part's Content-Type (e.g. the voice-changer/isolator endpoints)
 * need this set; an empty type is otherwise sent as application/octet-stream
 * on the wire and rejected. */
export function mimeTypeFor(file: string): string {
    return (
        MIME_BY_EXT[extname(file).toLowerCase()] || "application/octet-stream"
    );
}
