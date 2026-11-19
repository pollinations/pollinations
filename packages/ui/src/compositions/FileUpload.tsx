import { type ChangeEvent, type ReactNode, useEffect, useId } from "react";
import { cn } from "../lib/cn.ts";
import { acquireDocumentFileDropGuard } from "../lib/document-file-drop-guard.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
    type TileModality,
} from "../lib/media-action-tile.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { ImageIcon } from "../primitives/icons/index.tsx";
import { UploadedFileTile } from "./UploadedMedia.tsx";

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
    /** Render the add control when the caller owns the preview queue. */
    actionsOnly?: boolean;
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
    actionsOnly = false,
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

    if (actionsOnly && !canAdd && value.length) return null;
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
                {!actionsOnly &&
                    value.map((file, index) => (
                        <li
                            key={`${file.name}-${index}`}
                            className="polli:list-none"
                        >
                            <UploadedFileTile
                                file={file}
                                modality={tileModality}
                                previewIcon={previewIcon}
                                disabled={disabled}
                                onRemove={() =>
                                    onChange(
                                        value.filter((_, n) => n !== index),
                                    )
                                }
                            />
                        </li>
                    ))}
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
