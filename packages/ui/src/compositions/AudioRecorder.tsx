import { useEffect, useRef, useState } from "react";
import { RECORDING_SAMPLE_RATE, recordedWav } from "../lib/recorded-wav.ts";
import { Button } from "../primitives/Button.tsx";
import { MicIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

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
        "idle" | "requesting" | "recording" | "preparing"
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
            setState("recording");
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
    return (
        <div className="polli:flex polli:flex-col polli:items-start polli:gap-2">
            <Button
                type="button"
                size="sm"
                intent={state === "recording" ? "danger" : "neutral"}
                icon={<MicIcon />}
                disabled={
                    disabled || state === "requesting" || state === "preparing"
                }
                onClick={() => {
                    if (state === "recording") {
                        if (recorder.current?.state === "recording")
                            recorder.current.stop();
                    } else void record();
                }}
            >
                {state === "recording"
                    ? "Stop recording"
                    : state === "preparing"
                      ? "Preparing preview…"
                      : state === "requesting"
                        ? "Waiting for microphone…"
                        : label}
            </Button>
            {error && (
                <Text role="alert" size="sm">
                    {error}
                </Text>
            )}
        </div>
    );
}
