import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { mediaTileTint, type TileModality } from "../lib/media-action-tile.ts";
import {
    type PartitionOptions,
    partitionFiles,
    type RejectedFile,
} from "../lib/partition-files.ts";
import type { useUploadReorder } from "../lib/use-upload-reorder.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { ImageIcon, XIcon } from "../primitives/icons/index.tsx";
import { MediaPlayer } from "./AudioPlayer.tsx";

type MediaKind = Exclude<TileModality, "mixed">;

function fileMediaKind(
    file: File,
    fallback?: TileModality,
): MediaKind | undefined {
    const type = file.type.split("/")[0];
    if (type === "image" || type === "video" || type === "audio") return type;
    if (/\.(mp4|mov|webm|mkv)$/i.test(file.name)) return "video";
    return fallback === "mixed" ? undefined : fallback;
}

function MediaRemoveButton({
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

function UploadedClipPlayer({
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

const PREVIEWABLE_IMAGE_TYPES = new Set([
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const PREVIEW_SIZE = 80;

function isPreviewableImage(file: File): boolean {
    return PREVIEWABLE_IMAGE_TYPES.has(file.type);
}

function PreviewPlaceholder({ icon }: { icon: ReactNode }) {
    return (
        <div className="polli:flex polli:size-full polli:items-center polli:justify-center polli:text-[color:var(--polli-media-icon,var(--polli-color-text-soft))]">
            {icon}
        </div>
    );
}

function FilePreview({
    file,
    placeholderIcon,
}: {
    file: File;
    placeholderIcon: ReactNode;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [canPreview, setCanPreview] = useState(() =>
        isPreviewableImage(file),
    );

    useEffect(() => {
        if (!isPreviewableImage(file)) {
            setCanPreview(false);
            return;
        }

        let cancelled = false;
        setCanPreview(true);

        async function drawPreview() {
            try {
                const bitmap = await createImageBitmap(file);
                if (cancelled) {
                    bitmap.close();
                    return;
                }

                const canvas = canvasRef.current;
                const context = canvas?.getContext("2d");
                if (!canvas || !context) {
                    bitmap.close();
                    setCanPreview(false);
                    return;
                }

                canvas.width = PREVIEW_SIZE;
                canvas.height = PREVIEW_SIZE;

                const scale = Math.max(
                    PREVIEW_SIZE / bitmap.width,
                    PREVIEW_SIZE / bitmap.height,
                );
                const width = bitmap.width * scale;
                const height = bitmap.height * scale;
                const x = (PREVIEW_SIZE - width) / 2;
                const y = (PREVIEW_SIZE - height) / 2;

                context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
                context.drawImage(bitmap, x, y, width, height);
                bitmap.close();
            } catch {
                if (!cancelled) setCanPreview(false);
            }
        }

        void drawPreview();

        return () => {
            cancelled = true;
        };
    }, [file]);

    if (!canPreview) {
        return <PreviewPlaceholder icon={placeholderIcon} />;
    }

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={file.name}
            className="polli:block polli:size-full"
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
        />
    );
}

export function UploadedFileTile({
    file,
    modality,
    disabled = false,
    onRemove,
    onClipDuration,
    previewIcon,
    drop,
    reorder,
}: {
    file: File;
    reorder?: ReturnType<ReturnType<typeof useUploadReorder>>;
    modality?: TileModality;
    disabled?: boolean;
    onRemove: () => void;
    onClipDuration?: (file: File, seconds: number | null) => void;
    previewIcon?: ReactNode;
    /** Keep a separately rendered preview a drop target for its original input. */
    drop?: PartitionOptions & {
        value: File[];
        onChange: (files: File[]) => void;
        onReject?: (files: RejectedFile[]) => void;
    };
}) {
    const kind = fileMediaKind(file, modality);
    const reportDuration = useCallback(
        (seconds: number | null) => onClipDuration?.(file, seconds),
        [file, onClipDuration],
    );
    return (
        <fieldset
            {...reorder}
            aria-label={file.name}
            title={file.name}
            onDragOver={drop && ((event) => event.preventDefault())}
            onDrop={
                drop &&
                ((event) => {
                    event.preventDefault();
                    if (disabled) return;
                    const { accepted, rejected } = partitionFiles(
                        Array.from(event.dataTransfer.files),
                        drop.value,
                        drop,
                    );
                    if (accepted.length)
                        drop.onChange([...drop.value, ...accepted]);
                    if (rejected.length) drop.onReject?.(rejected);
                })
            }
            className="polli-upload-tile polli:relative polli:m-0 polli:w-20 polli:min-w-0 polli:shrink-0 polli:border-0 polli:p-0"
        >
            {kind === "video" || kind === "audio" ? (
                <UploadedClipPlayer
                    file={file}
                    video={kind === "video"}
                    disabled={disabled}
                    onDuration={onClipDuration && reportDuration}
                />
            ) : (
                <div
                    className="polli:relative polli:box-border polli:size-20 polli:overflow-hidden polli:rounded-xl polli:border-2 polli:border-theme-border polli:bg-theme-bg-pale"
                    {...mediaTileTint(kind)}
                >
                    <FilePreview
                        file={file}
                        placeholderIcon={
                            previewIcon ?? (
                                <ImageIcon className="polli:size-5" />
                            )
                        }
                    />
                </div>
            )}
            <span className="polli:sr-only">{file.name}</span>
            <MediaRemoveButton
                file={file}
                kind={kind}
                onRemove={disabled ? undefined : onRemove}
            />
        </fieldset>
    );
}
