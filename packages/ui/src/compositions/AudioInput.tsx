import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { acquireDocumentFileDropGuard } from "../lib/document-file-drop-guard.ts";
import { mediaActionTileClass } from "../lib/media-action-tile.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { CloudUploadIcon, XIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";
import { AudioPlayer } from "./AudioPlayer.tsx";
import { AudioRecorder } from "./AudioRecorder.tsx";

export type AudioInputProps = {
    value: File[];
    onChange: (files: File[]) => void;
    onBusyChange?: (busy: boolean) => void;
    onReject?: (files: RejectedFile[]) => void;
    accept?: string;
    importLabel?: string;
    maxFiles?: number;
    maxSizeBytes: number;
    disabled?: boolean;
};

function Clip({
    file,
    onRemove,
    disabled,
}: {
    file: File;
    onRemove: () => void;
    disabled: boolean;
}) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const src = URL.createObjectURL(file);
        setUrl(src);
        return () => URL.revokeObjectURL(src);
    }, [file]);
    return (
        <div className="polli:flex polli:min-w-0 polli:flex-col polli:gap-1">
            <div className="polli:flex polli:items-center polli:gap-2">
                <Text
                    size="sm"
                    weight="medium"
                    title={file.name}
                    className="polli:min-w-0 polli:flex-1 polli:truncate"
                >
                    {file.name}
                </Text>
                <IconButton
                    variant="ghost"
                    title={`Remove ${file.name}`}
                    onClick={onRemove}
                    disabled={disabled}
                >
                    <XIcon className="polli:size-4" />
                </IconButton>
            </div>
            {url && !file.type.startsWith("video/") && (
                <AudioPlayer src={url} label={file.name} />
            )}
        </div>
    );
}

export function AudioInput({
    value,
    onChange,
    onBusyChange,
    onReject,
    accept = "audio/*",
    importLabel = "Import audio",
    maxFiles = 1,
    maxSizeBytes,
    disabled = false,
}: AudioInputProps) {
    const picker = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const changeBusy = useCallback(
        (active: boolean) => {
            setBusy(active);
            onBusyChange?.(active);
        },
        [onBusyChange],
    );
    useEffect(() => acquireDocumentFileDropGuard(document), []);
    const replace = maxFiles === 1 && value.length > 0;
    const canAdd = replace || value.length < maxFiles;
    function add(files: File[]) {
        if (disabled || !files.length) return;
        const previous = maxFiles === 1 ? [] : value;
        const { accepted, rejected } = partitionFiles(files, previous, {
            accept,
            maxFiles,
            maxSizeBytes,
        });
        if (accepted.length) onChange([...previous, ...accepted]);
        setError("");
        if (rejected.length) {
            if (onReject) onReject(rejected);
            else
                setError(
                    {
                        size: "File exceeds the size limit.",
                        count: "Too many clips.",
                        type: "Choose a supported file type.",
                    }[rejected[0].reason],
                );
        }
    }
    return (
        <fieldset
            aria-label="Audio clips"
            className={cn(
                "polli:m-0 polli:flex polli:w-full polli:min-w-0 polli:flex-col polli:gap-3 polli:border-0 polli:p-0",
                value.length > 0 &&
                    "polli:rounded-card polli:bg-theme-bg-pale polli:p-3.5 polli:sm:p-4",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                if (!busy) add(Array.from(e.dataTransfer.files));
            }}
        >
            {!busy &&
                value.map((file, i) => (
                    <Clip
                        key={`${file.name}-${file.lastModified}-${i}`}
                        file={file}
                        disabled={disabled}
                        onRemove={() =>
                            onChange(value.filter((_, n) => n !== i))
                        }
                    />
                ))}
            {canAdd && (
                <div className="polli:flex polli:flex-wrap polli:items-start polli:gap-3">
                    <input
                        hidden
                        ref={picker}
                        type="file"
                        accept={accept}
                        multiple={maxFiles > 1}
                        disabled={busy || disabled}
                        aria-label={importLabel}
                        onChange={(e) => {
                            add(Array.from(e.currentTarget.files ?? []));
                            e.currentTarget.value = "";
                        }}
                    />
                    {!busy && (
                        <button
                            type="button"
                            className={mediaActionTileClass(disabled)}
                            disabled={disabled}
                            onClick={() => picker.current?.click()}
                        >
                            <CloudUploadIcon />
                            <span>
                                {replace ? "Replace file" : importLabel}
                            </span>
                        </button>
                    )}
                    <AudioRecorder
                        label={replace ? "Record again" : "Record audio"}
                        disabled={disabled}
                        maxBytes={maxSizeBytes}
                        onBusyChange={changeBusy}
                        onRecord={(file) => add([file])}
                    />
                </div>
            )}
            {error && (
                <Text role="alert" size="sm">
                    {error}
                </Text>
            )}
        </fieldset>
    );
}
