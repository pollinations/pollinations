import {
    type ChangeEvent,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { acquireDocumentFileDropGuard } from "../lib/document-file-drop-guard.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
    type TileModality,
} from "../lib/media-action-tile.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { ImageIcon } from "../primitives/icons/index.tsx";
import {
    fileMediaKind,
    MediaRemoveButton,
    mediaTypeIcons,
    VideoThumbnail,
} from "./UploadedMedia.tsx";

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
        <div className="polli:flex polli:size-full polli:items-center polli:justify-center polli:text-theme-text-soft">
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

export type FileUploadProps = {
    value: File[];
    onChange: (files: File[]) => void;
    onReject?: (rejected: RejectedFile[]) => void;
    maxFiles?: number;
    maxSizeBytes?: number;
    accept?: string;
    icon?: ReactNode;
    label?: ReactNode;
    previewIcon?: ReactNode;
    tileModality?: TileModality;
    /** Fully locks the field: no add, no remove, drops ignored. */
    disabled?: boolean;
    className?: string;
};

export function FileUpload({
    value,
    onChange,
    onReject,
    maxFiles = 4,
    maxSizeBytes = 10 * 1024 * 1024,
    accept = "image/*",
    tileModality,
    icon = <ImageIcon className="polli:h-6 polli:w-6" />,
    label = (
        <>
            Drag here or <span className="polli:underline">browse</span>
        </>
    ),
    previewIcon,
    disabled = false,
    className,
}: FileUploadProps) {
    // A near-miss file drop should not navigate the browser away from the app.
    // Mounted upload controls share one document-level guard.
    useEffect(() => acquireDocumentFileDropGuard(document), []);

    // Only `disabled` blocks drop handling. At the file limit the browse/add
    // controls disappear, but over-limit drops still flow through partitionFiles
    // and are reported as `{ reason: "count" }` via onReject.
    function addFiles(incoming: File[]) {
        if (disabled || incoming.length === 0) return;
        const { accepted, rejected } = partitionFiles(incoming, value, {
            maxFiles,
            maxSizeBytes,
            accept,
        });
        if (accepted.length > 0) onChange([...value, ...accepted]);
        if (rejected.length > 0) onReject?.(rejected);
    }

    const canAdd = !disabled && value.length < maxFiles;
    const inputId = useId();

    function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    }

    return (
        <fieldset
            disabled={disabled}
            className={cn(
                "polli:m-0 polli:min-w-0 polli:border-0 polli:p-0",
                disabled && "polli:opacity-50",
                className,
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
            }}
        >
            <ul className="polli:m-0 polli:flex polli:flex-wrap polli:gap-3 polli:p-0">
                {value.map((file, index) => {
                    const kind = fileMediaKind(file, tileModality);
                    const PlaceholderIcon = mediaTypeIcons[kind ?? "image"];
                    return (
                        <li
                            key={`${file.name}-${index}`}
                            title={file.name}
                            className="polli:relative polli:list-none"
                        >
                            <div
                                className="polli:relative polli:box-border polli:size-20 polli:overflow-hidden polli:rounded-xl polli:border-2 polli:border-theme-border polli:bg-theme-bg-pale"
                                {...mediaTileTint(kind)}
                            >
                                <FilePreview
                                    file={file}
                                    placeholderIcon={
                                        previewIcon ?? (
                                            <PlaceholderIcon className="polli:size-5" />
                                        )
                                    }
                                />
                                {kind === "video" && (
                                    <VideoThumbnail file={file} />
                                )}
                            </div>
                            <span className="polli:sr-only">{file.name}</span>
                            <MediaRemoveButton
                                file={file}
                                kind={kind}
                                onRemove={
                                    disabled
                                        ? undefined
                                        : () =>
                                              onChange(
                                                  value.filter(
                                                      (_, i) => i !== index,
                                                  ),
                                              )
                                }
                            />
                        </li>
                    );
                })}
                {(canAdd || value.length === 0) && (
                    <li className="polli:list-none">
                        <label
                            htmlFor={inputId}
                            className={mediaActionTileClass(!canAdd)}
                            {...mediaTileTint(tileModality)}
                        >
                            {icon}
                            <span>{label}</span>
                            <input
                                id={inputId}
                                type="file"
                                accept={accept}
                                multiple={maxFiles > 1}
                                disabled={!canAdd}
                                className="polli:sr-only"
                                onChange={handleInputChange}
                            />
                        </label>
                    </li>
                )}
            </ul>
        </fieldset>
    );
}
