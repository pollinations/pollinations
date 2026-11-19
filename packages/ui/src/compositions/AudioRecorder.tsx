import { useEffect, useRef, useState } from "react";
import { audioTime } from "../lib/audio-time.ts";
import {
    mediaActionTileClass,
    mediaTileTint,
} from "../lib/media-action-tile.ts";
import {
    nextRecordingName,
    RECORDING_SAMPLE_RATE,
    recordedWav,
} from "../lib/recorded-wav.ts";
import { MicIcon, VideoIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

type Capture = { stream: MediaStream; started: number };

function RecordingIndicator({
    stream,
    started,
    video,
}: Capture & { video: boolean }) {
    const preview = useRef<HTMLVideoElement>(null);
    const meter = useRef<HTMLSpanElement>(null);
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const camera = preview.current;
        if (camera) camera.srcObject = stream;
        let context: AudioContext | undefined;
        let sample: (() => void) | undefined;
        try {
            if (
                !video &&
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
            if (camera) camera.srcObject = null;
            window.clearInterval(timer);
            if (context) void context.close().catch(() => {});
        };
    }, [stream, started, video]);
    return (
        <>
            {video ? (
                <video
                    ref={preview}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Camera preview"
                    className="polli:absolute polli:inset-0 polli:size-full polli:rounded-xl polli:object-cover"
                />
            ) : (
                <span
                    ref={meter}
                    className="polli-mic-meter"
                    aria-hidden="true"
                >
                    <i />
                    <i />
                    <MicIcon className="polli:size-6" />
                    <i />
                    <i />
                </span>
            )}
            <span
                className={
                    video
                        ? "polli:pointer-events-none polli:absolute polli:bottom-1.5 polli:left-1.5 polli:inline-flex polli:items-center polli:gap-1 polli:rounded polli:bg-[rgb(0_0_0/0.65)] polli:px-1 polli:text-[#fff] polli:tabular-nums"
                        : "polli:whitespace-nowrap polli:tabular-nums"
                }
            >
                {video ? (
                    <span
                        aria-hidden="true"
                        className="polli:size-2 polli:rounded-[1px] polli:bg-current"
                    />
                ) : (
                    "Stop "
                )}
                {audioTime(seconds)}
            </span>
        </>
    );
}

type RecorderProps = {
    onRecord: (file: File) => void;
    onBusyChange?: (busy: boolean) => void;
    maxBytes: number;
    disabled?: boolean;
    label?: string;
};

export function AudioRecorder(props: RecorderProps) {
    return <CaptureTile {...props} video={false} />;
}

export function VideoRecorder(props: RecorderProps) {
    return <CaptureTile {...props} video />;
}

function CaptureTile({
    onRecord,
    onBusyChange,
    maxBytes,
    disabled = false,
    video,
    label = video ? "Record video" : "Record audio",
}: RecorderProps & { video: boolean }) {
    const Icon = video ? VideoIcon : MicIcon;
    const recorder = useRef<MediaRecorder | null>(null);
    const busy = useRef(false);
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
                (video || typeof OfflineAudioContext !== "undefined") &&
                !!navigator.mediaDevices?.getUserMedia,
        );
        return () => {
            mounted.current = false;
            for (const track of recorder.current?.stream.getTracks() ?? [])
                track.stop();
            if (busy.current) busyCallback.current?.(false);
        };
    }, [video]);

    async function record() {
        setError("");
        setState("requesting");
        busy.current = true;
        busyCallback.current?.(true);
        let stream: MediaStream | undefined;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: video || { channelCount: 1 },
                video,
            });
            if (!mounted.current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            const mimeType =
                video &&
                [
                    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
                    "video/mp4",
                    "video/webm",
                ].find((type) => MediaRecorder.isTypeSupported(type));
            const active = new MediaRecorder(
                stream,
                mimeType ? { mimeType } : undefined,
            );
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
                        (!video &&
                            performance.now() - started >= maxMilliseconds)) &&
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
                            "No usable media was recorded. Try recording again.",
                        );
                    if (size > maxBytes)
                        throw new Error(
                            "Recording exceeded the upload limit. Try a shorter recording.",
                        );
                    const blob = new Blob(chunks, {
                        type: active.mimeType.split(";")[0],
                    });
                    const file = video
                        ? new File(
                              [blob],
                              nextRecordingName(
                                  blob.type === "video/mp4" ? "mp4" : "webm",
                              ),
                              { type: blob.type },
                          )
                        : await recordedWav(blob, maxBytes);
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
                        busy.current = false;
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
            busy.current = false;
            busyCallback.current?.(false);
            setError(
                cause instanceof DOMException &&
                    cause.name === "NotAllowedError"
                    ? video
                        ? "Camera or microphone access was denied. Allow access or import a video."
                        : "Microphone access was denied. Allow it in your browser or upload a file."
                    : cause instanceof Error
                      ? cause.message
                      : "Could not start recording.",
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
                {...mediaTileTint(video ? "video" : "audio")}
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
                    <RecordingIndicator {...state} video={video} />
                ) : (
                    <>
                        <Icon />
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
