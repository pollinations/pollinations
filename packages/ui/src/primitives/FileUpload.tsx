import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { IconButton } from "./IconButton.tsx";
import { ImageIcon, XIcon } from "./icons/index.tsx";

export type FileUploadProps = {
    value: File[];
    onChange: (files: File[]) => void;
    onReject?: (rejected: RejectedFile[]) => void;
    maxFiles?: number;
    maxSizeBytes?: number;
    accept?: string;
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
    disabled = false,
    className,
}: FileUploadProps) {
    const [previews, setPreviews] = useState<string[]>([]);

    // Created after mount (never during SSR); revoked on change/unmount.
    useEffect(() => {
        const urls = value.map((file) => URL.createObjectURL(file));
        setPreviews(urls);
        return () => {
            for (const url of urls) URL.revokeObjectURL(url);
        };
    }, [value]);

    const atLimit = value.length >= maxFiles;
    const blocked = disabled || atLimit;

    function addFiles(incoming: File[]) {
        if (incoming.length === 0) return;
        const { accepted, rejected } = partitionFiles(incoming, value, {
            maxFiles,
            maxSizeBytes,
            accept,
        });
        if (accepted.length > 0) onChange([...value, ...accepted]);
        if (rejected.length > 0) onReject?.(rejected);
    }

    return (
        <div className={cn("polli:flex polli:flex-col polli:gap-3", className)}>
            <label
                className={cn(
                    "polli:flex polli:flex-col polli:items-center polli:justify-center polli:gap-2",
                    "polli:rounded-xl polli:border polli:border-dashed polli:border-theme-border",
                    "polli:bg-theme-bg-pale polli:px-4 polli:py-6 polli:text-center polli:text-sm",
                    "polli:text-theme-text-soft polli:transition-colors",
                    blocked
                        ? "polli:cursor-not-allowed polli:opacity-50"
                        : "polli:cursor-pointer polli:hover:bg-theme-bg-hover",
                )}
                onDragOver={(e) => {
                    if (blocked) return;
                    e.preventDefault();
                }}
                onDrop={(e) => {
                    if (blocked) return;
                    e.preventDefault();
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
                    disabled={blocked}
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
                            {previews[index] ? (
                                <img
                                    src={previews[index]}
                                    alt={file.name}
                                    className="polli:h-16 polli:w-16 polli:rounded-lg polli:object-cover"
                                />
                            ) : (
                                <div className="polli:h-16 polli:w-16 polli:rounded-lg polli:bg-theme-bg-active" />
                            )}
                            <span className="polli:max-w-16 polli:truncate polli:text-xs polli:text-theme-text-muted">
                                {file.name}
                            </span>
                            <div className="polli:absolute polli:-top-2 polli:-right-2">
                                <IconButton
                                    intent="danger"
                                    title={`Remove ${file.name}`}
                                    onClick={() =>
                                        onChange(
                                            value.filter((_, i) => i !== index),
                                        )
                                    }
                                >
                                    <XIcon className="polli:h-3 polli:w-3" />
                                </IconButton>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
