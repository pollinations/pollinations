import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import type { ThemeName } from "../theme.ts";
import { IconButton } from "./IconButton.tsx";
import { ImageIcon, XIcon } from "./icons/index.tsx";

const PREVIEWABLE_IMAGE_TYPES = new Set([
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const PREVIEW_SIZE = 64;

function isPreviewableImage(file: File): boolean {
    return PREVIEWABLE_IMAGE_TYPES.has(file.type);
}

function PreviewPlaceholder() {
    return (
        <div className="polli:flex polli:h-16 polli:w-16 polli:items-center polli:justify-center polli:rounded-lg polli:bg-theme-bg-active polli:text-theme-text-soft">
            <ImageIcon className="polli:h-5 polli:w-5" />
        </div>
    );
}

function FilePreview({ file }: { file: File }) {
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

    if (!canPreview) return <PreviewPlaceholder />;

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={file.name}
            className="polli:h-16 polli:w-16 polli:rounded-lg"
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
    /** Fully locks the field: no add, no remove, drops ignored. */
    disabled?: boolean;
    /** Optional cascade override; defaults to the inherited `[data-theme]`. */
    theme?: ThemeName;
    className?: string;
};

export function FileUpload({
    value,
    onChange,
    onReject,
    maxFiles = 4,
    maxSizeBytes = 10 * 1024 * 1024,
    accept = "image/*",
    disabled = false,
    theme,
    className,
}: FileUploadProps) {
    // A file dropped anywhere outside the zone otherwise triggers the browser's
    // default action — navigating the tab to that file (a blank/file page).
    // Suppress that document-wide so a near-miss drop is a no-op, not a page
    // takeover. (Same intent as react-dropzone's `preventDropOnDocument`.)
    useEffect(() => {
        const prevent = (event: DragEvent) => event.preventDefault();
        document.addEventListener("dragover", prevent);
        document.addEventListener("drop", prevent);
        return () => {
            document.removeEventListener("dragover", prevent);
            document.removeEventListener("drop", prevent);
        };
    }, []);

    // Only `disabled` blocks interaction. At the file limit the input stays
    // enabled so over-limit selections still flow through partitionFiles and
    // are reported as `{ reason: "count" }` via onReject (deterministic reject).
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

    return (
        <div
            data-theme={theme}
            className={cn("polli:flex polli:flex-col polli:gap-3", className)}
        >
            <label
                className={cn(
                    "polli-control polli:flex polli:flex-col polli:items-center polli:justify-center polli:gap-2",
                    "polli:rounded-xl polli:border polli:border-dashed polli:border-theme-border",
                    "polli:bg-theme-bg-pale polli:px-4 polli:py-6 polli:text-center polli:text-sm",
                    "polli:text-theme-text-soft polli:transition-colors",
                    disabled
                        ? "polli:cursor-not-allowed polli:opacity-50"
                        : "polli:cursor-pointer polli:hover:bg-theme-bg-hover",
                )}
                // Always prevent the browser's default file-drop navigation,
                // even when disabled; only the file handling is gated.
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    if (disabled) return;
                    addFiles(Array.from(e.dataTransfer.files));
                }}
            >
                <ImageIcon className="polli:h-6 polli:w-6" />
                <span>
                    Drag images here or{" "}
                    <span className="polli:underline">browse</span>
                </span>
                <input
                    type="file"
                    accept={accept}
                    multiple={maxFiles > 1}
                    disabled={disabled}
                    className="polli:sr-only"
                    onChange={(e) => {
                        addFiles(Array.from(e.target.files ?? []));
                        e.target.value = "";
                    }}
                />
            </label>

            {value.length > 0 && (
                <ul className="polli:m-0 polli:flex polli:flex-wrap polli:gap-3 polli:p-0">
                    {value.map((file, index) => (
                        <li
                            key={`${file.name}-${index}`}
                            className="polli:relative polli:flex polli:list-none polli:flex-col polli:gap-1"
                        >
                            <FilePreview file={file} />
                            <span className="polli:max-w-16 polli:truncate polli:text-xs polli:text-theme-text-muted">
                                {file.name}
                            </span>
                            {!disabled && (
                                <div className="polli:absolute polli:-top-2 polli:-right-2">
                                    <IconButton
                                        intent="danger"
                                        title={`Remove ${file.name}`}
                                        onClick={() =>
                                            onChange(
                                                value.filter(
                                                    (_, i) => i !== index,
                                                ),
                                            )
                                        }
                                    >
                                        <XIcon className="polli:h-3 polli:w-3" />
                                    </IconButton>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
