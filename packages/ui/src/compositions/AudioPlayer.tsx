import { useRef, useState } from "react";
import { audioTime } from "../lib/audio-time.ts";
import { IconButton } from "../primitives/IconButton.tsx";
import { PauseIcon, PlayIcon } from "../primitives/icons/index.tsx";
import { Slider } from "../primitives/Slider.tsx";
import { Text } from "../primitives/Typography.tsx";

export function AudioPlayer({ src, label }: { src: string; label: string }) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(false);
    return (
        <div className="polli:flex polli:min-w-0 polli:items-center polli:gap-2">
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
                onDurationChange={(e) =>
                    setDuration(
                        Number.isFinite(e.currentTarget.duration)
                            ? e.currentTarget.duration
                            : 0,
                    )
                }
                onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => setError(true)}
            />
            {error ? (
                <Text role="status" size="xs" tone="muted">
                    Preview unavailable in this browser.
                </Text>
            ) : (
                <>
                    <IconButton
                        size="md"
                        title={`${playing ? "Pause" : "Play"} ${label}`}
                        onClick={() => {
                            const element = audio.current;
                            if (!element) return;
                            if (element.paused)
                                void element.play().catch((cause: unknown) => {
                                    if (
                                        !(
                                            cause instanceof DOMException &&
                                            cause.name === "AbortError"
                                        )
                                    )
                                        setError(true);
                                });
                            else element.pause();
                        }}
                    >
                        {playing ? (
                            <PauseIcon className="polli:size-4" />
                        ) : (
                            <PlayIcon className="polli:size-4" />
                        )}
                    </IconButton>
                    <Slider
                        aria-label={`Seek ${label}`}
                        aria-valuetext={`${audioTime(position)} of ${audioTime(duration)}`}
                        min={0}
                        max={duration || 1}
                        step="any"
                        value={position}
                        disabled={!duration}
                        className="polli:min-w-0 polli:flex-1"
                        onChange={(e) => {
                            if (audio.current)
                                audio.current.currentTime =
                                    e.currentTarget.valueAsNumber;
                        }}
                    />
                    <Text
                        size="xs"
                        tone="muted"
                        className="polli:shrink-0 polli:tabular-nums"
                    >
                        {audioTime(position)} / {audioTime(duration)}
                    </Text>
                </>
            )}
        </div>
    );
}
