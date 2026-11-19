import {
    type ReactNode,
    type SyntheticEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import { audioTime } from "../lib/audio-time.ts";
import { cn } from "../lib/cn.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
    type TileModality,
} from "../lib/media-action-tile.ts";
import { PlayIcon } from "../primitives/icons/index.tsx";

export function AudioPlayer({
    src,
    label,
    disabled = false,
    tileModality = "audio",
    onDuration,
    children,
}: {
    src: string;
    label: string;
    disabled?: boolean;
    tileModality?: TileModality;
    onDuration?: (seconds: number | null) => void;
    children?: ReactNode;
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
                    "polli:isolate polli:border-solid",
                )}
                {...mediaTileTint(tileModality)}
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
                {children && (
                    <span
                        aria-hidden="true"
                        className="polli:pointer-events-none polli:absolute polli:inset-0 polli:-z-10 polli:opacity-40"
                    >
                        {children}
                    </span>
                )}
                {error ? (
                    "Preview unavailable"
                ) : (
                    <>
                        {playing ? (
                            <span
                                aria-hidden="true"
                                className="polli:m-1 polli:size-4 polli:rounded-sm polli:bg-[var(--polli-media-icon,currentColor)]"
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
