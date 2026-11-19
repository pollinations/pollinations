import { useEffect, useRef } from "react";
import type { TileModality } from "../lib/media-action-tile.ts";
import { modalityColorVar } from "../modules/gen/themes.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import {
    AudioIcon,
    ImageIcon,
    VideoIcon,
    XIcon,
} from "../primitives/icons/index.tsx";

export const mediaTypeIcons = {
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
};
type MediaKind = keyof typeof mediaTypeIcons;

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
    const Icon = kind ? mediaTypeIcons[kind] : XIcon;
    const icon = (
        <Icon
            className="polli:size-4"
            style={kind && { color: modalityColorVar(kind) }}
        />
    );
    return (
        <div className="polli:absolute polli:-top-2 polli:right-1">
            {onRemove ? (
                <IconButton
                    intent="danger"
                    title={`Remove ${file.name}`}
                    aria-description={kind}
                    className="polli:group polli:bg-black/85 polli:focus-visible:bg-intent-danger-bg-hover"
                    onClick={onRemove}
                >
                    <span className="polli:group-hover:hidden polli:group-focus-visible:hidden">
                        {icon}
                    </span>
                    <XIcon className="polli:hidden polli:size-4 polli:group-hover:block polli:group-focus-visible:block" />
                </IconButton>
            ) : (
                kind && (
                    <span
                        role="img"
                        aria-label={kind}
                        className="polli:grid polli:size-6 polli:place-items-center polli:rounded polli:bg-black/85"
                    >
                        {icon}
                    </span>
                )
            )}
        </div>
    );
}

/** Keep a small still and release the decoder as soon as the frame is drawn. */
export function VideoThumbnail({ file }: { file: File }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        let frame: number | undefined;
        const timeout = window.setTimeout(release, 5000);
        function release() {
            window.clearTimeout(timeout);
            if (frame !== undefined) video.cancelVideoFrameCallback(frame);
            video.onloadedmetadata =
                video.onloadeddata =
                video.onseeked =
                video.onerror =
                    null;
            if (!video.hasAttribute("src")) return;
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(url);
        }
        const draw = () => {
            const size = Math.min(video.videoWidth, video.videoHeight);
            if (size) {
                ctx.drawImage(
                    video,
                    (video.videoWidth - size) / 2,
                    (video.videoHeight - size) / 2,
                    size,
                    size,
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                );
            }
            release();
        };
        video.onloadedmetadata = () => {
            // WebKit can finish seeking before the decoded frame is paintable.
            if (video.requestVideoFrameCallback) {
                frame = video.requestVideoFrameCallback(draw);
            } else {
                video.onloadeddata = video.onseeked = () => {
                    if (!video.seeking) draw();
                };
            }
            if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(0.15, video.duration / 2);
            }
        };
        video.onerror = release;
        video.src = url;
        return release;
    }, [file]);
    return (
        <canvas
            ref={ref}
            width={80}
            height={80}
            role="img"
            aria-label={`Video thumbnail for ${file.name}`}
            className="polli:pointer-events-none polli:absolute polli:inset-0 polli:size-full polli:rounded-xl"
        />
    );
}
