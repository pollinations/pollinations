import { Button, cn, DownloadIcon } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { downloadMedia } from "./media-download";

export function MediaDownloadButton({
    source,
    filename,
    label,
    className,
    onError,
}: {
    source: string;
    filename: string;
    label: string;
    className?: string;
    onError: (message: string | null) => void;
}) {
    const [downloading, setDownloading] = useState(false);
    const downloadRef = useRef<AbortController | null>(null);
    useEffect(() => () => downloadRef.current?.abort(), []);

    async function download() {
        if (downloadRef.current) return;
        const controller = new AbortController();
        downloadRef.current = controller;
        setDownloading(true);
        onError(null);
        try {
            await downloadMedia(source, filename, controller.signal);
        } catch {
            if (!controller.signal.aborted)
                onError("Could not download this file. Try again.");
        } finally {
            downloadRef.current = null;
            setDownloading(false);
        }
    }

    return (
        <Button
            type="button"
            size="sm"
            aria-label={downloading ? "Downloading…" : label}
            title={label}
            disabled={downloading}
            className={className}
            onClick={() => void download()}
        >
            <DownloadIcon
                className={cn("size-4", downloading && "animate-pulse")}
            />
        </Button>
    );
}
