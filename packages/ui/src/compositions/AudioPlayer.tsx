import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { audioTime } from "../lib/audio-time.ts";
import { cn } from "../lib/cn.ts";
import { mediaActionTileClass } from "../lib/media-action-tile.ts";
import { PlayIcon } from "../primitives/icons/index.tsx";

export function AudioPlayer({
    src,
    label,
    disabled = false,
    onDuration,
}: {
    src: string;
    label: string;
    disabled?: boolean;
    onDuration?: (seconds: number | null) => void;
}) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (disabled) audio.current?.pause();
    }, [disabled]);
    useEffect(() => {
        if (!src || !onDuration) return;
        // Some mobile browsers defer metadata until the first user gesture.
        const timer = window.setTimeout(() => {
            if (audio.current && audio.current.readyState < 1) onDuration(null);
        }, 5000);
        return () => window.clearTimeout(timer);
    }, [src, onDuration]);
    function updateDuration(event: SyntheticEvent<HTMLAudioElement>) {
        const seconds = event.currentTarget.duration;
        const known = Number.isFinite(seconds) ? seconds : null;
        setDuration(known ?? 0);
        onDuration?.(known);
    }
    return (
        <>
            {/* biome-ignore lint/a11y/useMediaCaption: This local audio preview has no timed captions. */}
            <audio
                ref={audio}
                src={src}
                preload="metadata"
                aria-label={label}
                onLoadStart={() => {
                    setPlaying(false);
                    setPosition(0);
                    setDuration(0);
                    setError(false);
                }}
                onLoadedMetadata={updateDuration}
                onDurationChange={updateDuration}
                onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={(e) => {
                    setPlaying(false);
                    if (!e.currentTarget.ended) e.currentTarget.currentTime = 0;
                }}
                onEnded={() => setPlaying(false)}
                onError={() => {
                    setError(true);
                    onDuration?.(null);
                }}
            />
            <button
                type="button"
                className={cn(
                    mediaActionTileClass(disabled || error),
                    "polli:border-solid",
                )}
                title={label}
                aria-label={
                    error
                        ? `Preview unavailable for ${label}`
                        : `${playing ? "Stop" : "Play"} ${label}`
                }
                disabled={disabled || error}
                onClick={() => {
                    const element = audio.current;
                    if (!element) return;
                    if (element.paused) {
                        void element.play().catch((cause: unknown) => {
                            if (
                                !(
                                    cause instanceof DOMException &&
                                    cause.name === "AbortError"
                                )
                            )
                                setError(true);
                        });
                    } else {
                        element.pause();
                    }
                }}
            >
                {error ? (
                    "Preview unavailable"
                ) : (
                    <>
                        {playing ? (
                            <span
                                aria-hidden="true"
                                className="polli:m-1 polli:size-4 polli:rounded-sm polli:bg-current"
                            />
                        ) : (
                            <PlayIcon />
                        )}
                        <span className="polli:tabular-nums">
                            {audioTime(playing ? position : duration)}
                        </span>
                    </>
                )}
            </button>
        </>
    );
}
