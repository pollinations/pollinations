import { useEffect, useState } from "react";
import type { TileModality } from "../lib/media-action-tile.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { XIcon } from "../primitives/icons/index.tsx";
import { MediaPlayer } from "./AudioPlayer.tsx";

type MediaKind = Exclude<TileModality, "mixed">;

export function fileMediaKind(
    file: File,
    fallback?: TileModality,
): MediaKind | undefined {
    const type = file.type.split("/")[0];
    if (type === "image" || type === "video" || type === "audio") return type;
    if (/\.(mp4|mov|webm|mkv)$/i.test(file.name)) return "video";
    return fallback === "mixed" ? undefined : fallback;
}

export function MediaRemoveButton({
    file,
    kind,
    onRemove,
}: {
    file: File;
    kind?: MediaKind;
    onRemove?: () => void;
}) {
    if (!onRemove) return null;
    return (
        <div className="polli-upload-remove polli:flex polli:justify-center">
            <IconButton
                variant="ghost"
                aria-label={`Remove ${file.name}`}
                aria-description={kind}
                className="polli:min-h-7 polli:w-auto polli:gap-1 polli:px-1 polli:text-xs"
                onClick={onRemove}
            >
                <XIcon className="polli:size-3" />
                Remove
            </IconButton>
        </div>
    );
}

export function UploadedClipPlayer({
    file,
    video,
    disabled,
    onDuration,
}: {
    file: File;
    disabled: boolean;
    video: boolean;
    onDuration?: (seconds: number | null) => void;
}) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const src = URL.createObjectURL(file);
        setUrl(src);
        return () => URL.revokeObjectURL(src);
    }, [file]);
    return (
        <MediaPlayer
            src={url}
            label={file.name}
            video={video}
            tileModality={video ? "video" : "audio"}
            disabled={disabled || !url}
            onDuration={onDuration}
        />
    );
}
