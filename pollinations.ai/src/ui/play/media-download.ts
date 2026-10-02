const MIME_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "audio/mpeg": "mp3",
    "audio/x-wav": "wav",
    "video/quicktime": "mov",
    "text/plain": "txt",
};

/** Download a same-origin Blob so cross-origin links do not navigate away. */
export async function downloadMedia(
    source: string,
    filename: string,
    signal: AbortSignal,
): Promise<void> {
    signal.throwIfAborted();
    const response = await fetch(source, { signal, credentials: "omit" });
    if (!response.ok)
        throw new Error("Could not download this file. Try again.");
    const blob = await response.blob();
    signal.throwIfAborted();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const mime = blob.type.split(";")[0].trim();
    const extension = MIME_EXTENSIONS[mime] ?? mime.split("/")[1];
    link.href = url;
    link.download =
        /\.[a-z0-9]+$/i.test(filename) || !extension
            ? filename
            : `${filename}.${extension}`;
    link.hidden = true;
    document.body.append(link);
    try {
        link.click();
    } finally {
        link.remove();
        // Let the browser begin consuming the download before releasing it.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
