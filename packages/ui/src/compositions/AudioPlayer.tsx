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

type AudioPlayerProps = {
    src: string;
    label: string;
    disabled?: boolean;
    tileModality?: TileModality;
    onDuration?: (seconds: number | null) => void;
    children?: ReactNode;
};

export function AudioPlayer(props: AudioPlayerProps) {
    return <MediaPlayer {...props} />;
}

export function MediaPlayer({
    src,
    label,
    disabled = false,
    tileModality = "audio",
    onDuration,
    children,
    video = false,
}: AudioPlayerProps & { video?: boolean }) {
    const media = useRef<HTMLMediaElement | null>(null);
    const Element = video ? "video" : "audio";
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (disabled) media.current?.pause();
    }, [disabled]);
    useEffect(() => {
        if (!src || !onDuration) return;
        // Some mobile browsers defer metadata until the first user gesture.
        const timer = window.setTimeout(() => {
            if (media.current && media.current.readyState < 1) onDuration(null);
        }, 5000);
        return () => window.clearTimeout(timer);
    }, [src, onDuration]);
    function updateDuration(event: SyntheticEvent<HTMLMediaElement>) {
        const seconds = event.currentTarget.duration;
        const known = Number.isFinite(seconds) ? seconds : null;
        setDuration(known ?? 0);
        onDuration?.(known);
    }
    return (
        <div className="polli:relative polli:size-20">
            <Element
                ref={(el) => {
                    media.current = el;
                }}
                src={src ? (video ? `${src}#t=0.001` : src) : undefined}
                playsInline={video || undefined}
                className={
                    video
                        ? "polli:pointer-events-none polli:absolute polli:inset-0 polli:size-full polli:rounded-xl polli:object-cover"
                        : undefined
                }
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
                onPlay={(event) => {
                    setPlaying(true);
                    const current = event.currentTarget;
                    if (current.closest(".polli-upload-tile")) {
                        for (const other of current.ownerDocument.querySelectorAll<HTMLMediaElement>(
                            ".polli-upload-tile :is(audio, video)",
                        )) {
                            if (other !== current && !other.paused)
                                other.pause();
                        }
                    }
                }}
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
                    video && "polli:bg-transparent polli:hover:bg-transparent",
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
                    const element = media.current;
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
                    <span
                        className={
                            video
                                ? "polli:rounded polli:bg-[rgb(0_0_0/0.75)] polli:px-1 polli:text-[#fff]"
                                : undefined
                        }
                    >
                        Preview unavailable
                    </span>
                ) : (
                    <>
                        {video ? (
                            <span
                                aria-hidden="true"
                                className="polli:pointer-events-none polli:absolute polli:bottom-1.5 polli:left-1.5 polli:grid polli:size-5 polli:place-items-center polli:rounded-full polli:bg-[rgb(0_0_0/0.65)] polli:text-[#fff]"
                            >
                                {playing ? (
                                    <span className="polli:size-2 polli:rounded-[1px] polli:bg-current" />
                                ) : (
                                    <PlayIcon className="polli:size-4" />
                                )}
                            </span>
                        ) : playing ? (
                            <span
                                aria-hidden="true"
                                className="polli:m-1 polli:size-4 polli:rounded-sm polli:bg-[var(--polli-media-icon,currentColor)]"
                            />
                        ) : (
                            <PlayIcon />
                        )}
                        {!video && (
                            <span className="polli:tabular-nums">
                                {audioTime(playing ? position : duration)}
                            </span>
                        )}
                    </>
                )}
            </button>
        </div>
    );
}
