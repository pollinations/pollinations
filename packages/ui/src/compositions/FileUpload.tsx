import {
    type ChangeEvent,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { ImageIcon, PlusIcon, XIcon } from "../primitives/icons/index.tsx";

const PREVIEWABLE_IMAGE_TYPES = new Set([
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);
const PREVIEW_SIZE = 64;
const LARGE_PREVIEW_SIZE = 112;

const previewSizeClasses = {
    sm: "polli:h-16 polli:w-16",
    lg: "polli:h-28 polli:w-28",
} as const;

function isPreviewableImage(file: File): boolean {
    return PREVIEWABLE_IMAGE_TYPES.has(file.type);
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewPlaceholder({
    icon,
    size,
}: {
    icon: ReactNode;
    size: "sm" | "lg";
}) {
    return (
        <div
            className={cn(
                "polli:flex polli:items-center polli:justify-center polli:rounded-lg polli:bg-theme-bg-active polli:text-theme-text-soft",
                previewSizeClasses[size],
            )}
        >
            {icon}
        </div>
    );
}

function FilePreview({
    file,
    placeholderIcon,
    size = "sm",
}: {
    file: File;
    placeholderIcon: ReactNode;
    size?: "sm" | "lg";
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [canPreview, setCanPreview] = useState(() =>
        isPreviewableImage(file),
    );
    const previewSize = size === "lg" ? LARGE_PREVIEW_SIZE : PREVIEW_SIZE;

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

                canvas.width = previewSize;
                canvas.height = previewSize;

                const scale = Math.max(
                    previewSize / bitmap.width,
                    previewSize / bitmap.height,
                );
                const width = bitmap.width * scale;
                const height = bitmap.height * scale;
                const x = (previewSize - width) / 2;
                const y = (previewSize - height) / 2;

                context.clearRect(0, 0, previewSize, previewSize);
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
    }, [file, previewSize]);

    if (!canPreview) {
        return <PreviewPlaceholder icon={placeholderIcon} size={size} />;
    }

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={file.name}
            className={cn("polli:rounded-lg", previewSizeClasses[size])}
            width={previewSize}
            height={previewSize}
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
    icon = <ImageIcon className="polli:h-6 polli:w-6" />,
    label = (
        <>
            Drag images here or <span className="polli:underline">browse</span>
        </>
    ),
    previewIcon = <ImageIcon className="polli:h-5 polli:w-5" />,
    disabled = false,
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

    const hasFiles = value.length > 0;
    const canAdd = !disabled && value.length < maxFiles;
    const isSingleFile = maxFiles === 1;
    const previewSize = isSingleFile ? "lg" : "sm";
    const inputId = useId();
    const addInputId = `${inputId}-add`;

    function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    }

    return (
        <div className={cn("polli:flex polli:flex-col polli:gap-2", className)}>
            <fieldset
                disabled={disabled}
                className={cn(
                    "polli:m-0",
                    "polli:rounded-xl polli:border polli:border-dashed polli:border-theme-border polli:bg-theme-bg-pale",
                    "polli:px-4 polli:py-4 polli:text-center polli:text-sm",
                    "polli:text-theme-text-soft polli:transition-colors",
                    disabled
                        ? "polli:opacity-50"
                        : "polli:hover:bg-theme-bg-hover",
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
                {!hasFiles ? (
                    <label
                        htmlFor={inputId}
                        className={cn(
                            "polli-control polli:flex polli:min-h-32 polli:flex-col polli:items-center polli:justify-center polli:gap-2 polli:rounded-lg",
                            canAdd
                                ? "polli:cursor-pointer"
                                : "polli:cursor-not-allowed",
                        )}
                    >
                        {icon}
                        <span>{label}</span>
                        <input
                            id={inputId}
                            type="file"
                            accept={accept}
                            multiple={maxFiles > 1}
                            disabled={disabled || !canAdd}
                            className="polli:sr-only"
                            onChange={handleInputChange}
                        />
                    </label>
                ) : (
                    <div className="polli:flex polli:flex-col polli:gap-3">
                        <ul
                            className={cn(
                                "polli:m-0 polli:grid polli:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] polli:gap-3 polli:p-0",
                                isSingleFile &&
                                    "polli:flex polli:justify-center",
                            )}
                        >
                            {value.map((file, index) => (
                                <li
                                    key={`${file.name}-${index}`}
                                    className={cn(
                                        "polli:relative polli:flex polli:min-w-0 polli:list-none polli:flex-col polli:items-center polli:gap-1",
                                        isSingleFile && "polli:max-w-full",
                                    )}
                                >
                                    <FilePreview
                                        file={file}
                                        placeholderIcon={previewIcon}
                                        size={previewSize}
                                    />
                                    <span
                                        className={cn(
                                            "polli:max-w-full polli:truncate polli:text-xs polli:font-medium polli:text-theme-text-base",
                                            isSingleFile
                                                ? "polli:w-36"
                                                : "polli:w-16",
                                        )}
                                    >
                                        {file.name}
                                    </span>
                                    <span className="polli:text-micro polli:text-theme-text-muted">
                                        {formatFileSize(file.size)}
                                    </span>
                                    {!disabled && (
                                        <div className="polli:absolute polli:-top-2 polli:right-1">
                                            <IconButton
                                                intent="danger"
                                                title={`Remove ${file.name}`}
                                                onClick={() =>
                                                    onChange(
                                                        value.filter(
                                                            (_, i) =>
                                                                i !== index,
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

                            {!isSingleFile && canAdd && (
                                <li className="polli:flex polli:list-none">
                                    <label
                                        htmlFor={addInputId}
                                        className="polli-control polli:flex polli:min-h-20 polli:w-full polli:cursor-pointer polli:flex-col polli:items-center polli:justify-center polli:gap-1 polli:rounded-lg polli:bg-theme-bg-active polli:px-3 polli:py-2 polli:text-theme-text-soft polli:transition-colors polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-strong"
                                    >
                                        <PlusIcon className="polli:h-5 polli:w-5" />
                                        <span className="polli:text-xs polli:font-medium">
                                            Add
                                        </span>
                                        <input
                                            id={addInputId}
                                            type="file"
                                            accept={accept}
                                            multiple
                                            disabled={disabled || !canAdd}
                                            className="polli:sr-only"
                                            onChange={handleInputChange}
                                        />
                                    </label>
                                </li>
                            )}
                        </ul>

                        {maxFiles > 1 && (
                            <span className="polli:text-xs polli:text-theme-text-muted">
                                {value.length} / {maxFiles} files
                            </span>
                        )}
                    </div>
                )}
            </fieldset>
        </div>
    );
}
