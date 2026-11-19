import { useCallback, useEffect, useRef, useState } from "react";
import { acquireDocumentFileDropGuard } from "../lib/document-file-drop-guard.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
    type TileModality,
} from "../lib/media-action-tile.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { CloudUploadIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";
import { AudioPlayer } from "./AudioPlayer.tsx";
import { AudioRecorder } from "./AudioRecorder.tsx";
import {
    fileMediaKind,
    MediaRemoveButton,
    VideoThumbnail,
} from "./UploadedMedia.tsx";

export type AudioInputProps = {
    value: File[];
    onChange: (files: File[]) => void;
    onBusyChange?: (busy: boolean) => void;
    /** Browser-readable duration in seconds, or null when local preview is unavailable. */
    onClipDuration?: (file: File, seconds: number | null) => void;
    onReject?: (files: RejectedFile[]) => void;
    accept?: string;
    importLabel?: string;
    tileModality?: TileModality;
    maxFiles?: number;
    maxSizeBytes: number;
    disabled?: boolean;
};

function Clip({
    file,
    onRemove,
    onClipDuration,
    disabled,
}: {
    file: File;
    onRemove: () => void;
    onClipDuration?: AudioInputProps["onClipDuration"];
    disabled: boolean;
}) {
    const [url, setUrl] = useState("");
    const kind = fileMediaKind(file) ?? "audio";
    const reportDuration = useCallback(
        (seconds: number | null) => onClipDuration?.(file, seconds),
        [file, onClipDuration],
    );
    useEffect(() => {
        const src = URL.createObjectURL(file);
        setUrl(src);
        return () => URL.revokeObjectURL(src);
    }, [file]);
    return (
        <div
            title={file.name}
            className="polli:relative polli:size-20 polli:shrink-0"
        >
            {url && (
                <AudioPlayer
                    src={url}
                    label={file.name}
                    tileModality={kind}
                    disabled={disabled}
                    onDuration={onClipDuration && reportDuration}
                >
                    {kind === "video" && <VideoThumbnail file={file} />}
                </AudioPlayer>
            )}
            <MediaRemoveButton
                file={file}
                kind={kind}
                onRemove={disabled ? undefined : onRemove}
            />
        </div>
    );
}

export function AudioInput({
    value,
    onChange,
    onBusyChange,
    onClipDuration,
    onReject,
    accept = "audio/*",
    importLabel = "Import audio",
    tileModality = "audio",
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
    const canAdd = value.length < maxFiles;
    function add(files: File[]) {
        if (disabled || !files.length) return;
        const { accepted, rejected } = partitionFiles(files, value, {
            accept,
            maxFiles,
            maxSizeBytes,
        });
        if (accepted.length) onChange([...value, ...accepted]);
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
            className="polli:m-0 polli:w-full polli:min-w-0 polli:border-0 polli:p-0"
            onPlay={(e) => {
                for (const clip of e.currentTarget.querySelectorAll("audio")) {
                    if (clip !== e.target) clip.pause();
                }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                if (!busy) add(Array.from(e.dataTransfer.files));
            }}
        >
            <div className="polli:flex polli:flex-wrap polli:items-start polli:gap-3">
                {value.map((file, i) => (
                    <Clip
                        key={`${file.name}-${file.lastModified}-${i}`}
                        file={file}
                        onClipDuration={onClipDuration}
                        disabled={disabled || busy}
                        onRemove={() =>
                            onChange(value.filter((_, n) => n !== i))
                        }
                    />
                ))}
                {canAdd && (
                    <>
                        <AudioRecorder
                            disabled={disabled}
                            maxBytes={maxSizeBytes}
                            onBusyChange={changeBusy}
                            onRecord={(file) => add([file])}
                        />
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
                                {...mediaTileTint(tileModality)}
                                disabled={disabled}
                                onClick={() => picker.current?.click()}
                            >
                                <CloudUploadIcon />
                                <span>{importLabel}</span>
                            </button>
                        )}
                    </>
                )}
            </div>
            {error && (
                <Text role="alert" size="sm">
                    {error}
                </Text>
            )}
        </fieldset>
    );
}
