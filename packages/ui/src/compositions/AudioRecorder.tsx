import { useEffect, useRef, useState } from "react";
import { audioTime } from "../lib/audio-time.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
} from "../lib/media-action-tile.ts";
import { RECORDING_SAMPLE_RATE, recordedWav } from "../lib/recorded-wav.ts";
import { MicIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

type Capture = { stream: MediaStream; started: number };

function RecordingIndicator({ stream, started }: Capture) {
    const meter = useRef<HTMLSpanElement>(null);
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        let context: AudioContext | undefined;
        let sample: (() => void) | undefined;
        try {
            if (
                !window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches &&
                typeof AudioContext !== "undefined"
            ) {
                context = new AudioContext();
                const analyser = context.createAnalyser();
                analyser.fftSize = 512;
                context.createMediaStreamSource(stream).connect(analyser);
                void context.resume().catch(() => {});
                const samples = new Float32Array(analyser.fftSize);
                sample = () => {
                    analyser.getFloatTimeDomainData(samples);
                    let sum = 0;
                    for (const value of samples) sum += value * value;
                    const rms = Math.sqrt(sum / samples.length);
                    meter.current?.style.setProperty(
                        "--mic-level",
                        String(Math.min(1, rms * 8)),
                    );
                };
            }
        } catch {
            // The clock and capture also work without a live meter.
        }
        const timer = window.setInterval(
            () => {
                sample?.();
                setSeconds(Math.floor((performance.now() - started) / 1000));
            },
            sample ? 100 : 250,
        );
        return () => {
            window.clearInterval(timer);
            if (context) void context.close().catch(() => {});
        };
    }, [stream, started]);
    return (
        <>
            <span ref={meter} className="polli-mic-meter" aria-hidden="true">
                <i />
                <i />
                <MicIcon className="polli:size-6" />
                <i />
                <i />
            </span>
            <span className="polli:whitespace-nowrap polli:tabular-nums">
                Stop {audioTime(seconds)}
            </span>
        </>
    );
}

export function AudioRecorder({
    onRecord,
    onBusyChange,
    maxBytes,
    disabled = false,
    label = "Record audio",
}: {
    onRecord: (file: File) => void;
    onBusyChange?: (busy: boolean) => void;
    maxBytes: number;
    disabled?: boolean;
    label?: string;
}) {
    const recorder = useRef<MediaRecorder | null>(null);
    const mounted = useRef(false);
    const busyCallback = useRef(onBusyChange);
    useEffect(() => {
        busyCallback.current = onBusyChange;
    }, [onBusyChange]);
    const [state, setState] = useState<
        "idle" | "requesting" | Capture | "preparing"
    >("idle");
    const [available, setAvailable] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        mounted.current = true;
        setAvailable(
            typeof MediaRecorder !== "undefined" &&
                typeof OfflineAudioContext !== "undefined" &&
                !!navigator.mediaDevices?.getUserMedia,
        );
        return () => {
            mounted.current = false;
            for (const track of recorder.current?.stream.getTracks() ?? [])
                track.stop();
            busyCallback.current?.(false);
        };
    }, []);

    async function record() {
        setError("");
        setState("requesting");
        busyCallback.current?.(true);
        let stream: MediaStream | undefined;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1 },
            });
            if (!mounted.current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            const active = new MediaRecorder(stream);
            recorder.current = active;
            const chunks: Blob[] = [];
            let size = 0;
            let failed = false;
            const started = performance.now();
            const maxMilliseconds =
                ((maxBytes - 44) * 1000) / (RECORDING_SAMPLE_RATE * 2);
            active.ondataavailable = ({ data }) => {
                size += data.size;
                if (size <= maxBytes) chunks.push(data);
                if (
                    (size > maxBytes ||
                        performance.now() - started >= maxMilliseconds) &&
                    active.state === "recording"
                )
                    active.stop();
            };
            active.onerror = () => {
                failed = true;
            };
            active.onstop = async () => {
                for (const track of active.stream.getTracks()) track.stop();
                recorder.current = null;
                if (!mounted.current) return;
                setState("preparing");
                try {
                    if (failed || !size)
                        throw new Error(
                            "No usable audio was recorded. Try recording again.",
                        );
                    if (size > maxBytes)
                        throw new Error(
                            "Recording exceeded the upload limit. Try a shorter recording.",
                        );
                    const file = await recordedWav(
                        new Blob(chunks, { type: active.mimeType }),
                        maxBytes,
                    );
                    if (mounted.current) onRecord(file);
                } catch (cause) {
                    if (mounted.current)
                        setError(
                            cause instanceof Error
                                ? cause.message
                                : "Could not read the recording.",
                        );
                } finally {
                    if (mounted.current) {
                        setState("idle");
                        busyCallback.current?.(false);
                    }
                }
            };
            active.start(1000);
            setState({ stream, started });
        } catch (cause) {
            for (const track of stream?.getTracks() ?? []) track.stop();
            recorder.current = null;
            if (!mounted.current) return;
            setState("idle");
            busyCallback.current?.(false);
            setError(
                cause instanceof DOMException &&
                    cause.name === "NotAllowedError"
                    ? "Microphone access was denied. Allow it in your browser or upload a file."
                    : cause instanceof Error
                      ? cause.message
                      : "Could not start the microphone.",
            );
        }
    }
    if (!available) return null;
    const waiting = state === "requesting" || state === "preparing";
    return (
        <div className="polli:flex polli:flex-col polli:items-start polli:gap-2">
            <button
                type="button"
                className={mediaActionTileClass(
                    disabled || waiting,
                    typeof state === "object",
                )}
                {...mediaTileTint("audio")}
                aria-label={
                    typeof state === "object" ? "Stop recording" : undefined
                }
                disabled={disabled || waiting}
                onClick={() => {
                    if (typeof state === "object") {
                        if (recorder.current?.state === "recording")
                            recorder.current.stop();
                    } else void record();
                }}
            >
                {typeof state === "object" ? (
                    <RecordingIndicator {...state} />
                ) : (
                    <>
                        <MicIcon />
                        <span>
                            {state === "preparing"
                                ? "Preparing…"
                                : state === "requesting"
                                  ? "Waiting…"
                                  : label}
                        </span>
                    </>
                )}
            </button>
            {error && (
                <Text role="alert" size="sm">
                    {error}
                </Text>
            )}
        </div>
    );
}
