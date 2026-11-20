import { pcmToWav } from "../../../../shared/pcm-to-wav.ts";

// Browsers record in different containers. Audio endpoints share PCM WAV.
export const RECORDING_SAMPLE_RATE = 44100;
const HEADER_BYTES = 44;
let recordingNumber = 0;

export function nextRecordingName(extension: string) {
    // Keep numbering across model changes and reloads in this tab.
    const key = "pollinations.ui.recordingNumber";
    try {
        const saved = Number(sessionStorage.getItem(key));
        if (Number.isSafeInteger(saved) && saved > recordingNumber)
            recordingNumber = saved;
        sessionStorage.setItem(key, String(recordingNumber + 1));
    } catch {
        // Browsers with storage disabled still number clips for this page.
    }
    recordingNumber += 1;
    return `Pollinations recording ${String(recordingNumber).padStart(2, "0")}.${extension}`;
}

export function maxRecordingSamples(maxBytes: number) {
    return Math.floor((maxBytes - HEADER_BYTES) / 2);
}

export async function recordedWav(blob: Blob, maxBytes: number): Promise<File> {
    const decoder = new OfflineAudioContext(1, 1, RECORDING_SAMPLE_RATE);
    const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, n) =>
        audio.getChannelData(n),
    );
    return new File(
        [encodeRecordedWav(channels, audio.sampleRate, maxBytes)],
        nextRecordingName("wav"),
        { type: "audio/wav" },
    );
}

export function encodeRecordedWav(
    channels: Float32Array[],
    sampleRate: number,
    maxBytes: number,
) {
    // MediaRecorder can deliver the final chunk after the WAV duration limit.
    const samples = Math.min(
        channels[0]?.length ?? 0,
        maxRecordingSamples(maxBytes),
    );
    if (samples < 1) throw new Error("No audio samples fit in the recording.");
    const pcm = new DataView(new ArrayBuffer(samples * 2));
    for (let i = 0; i < samples; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i];
        value = Math.max(-1, Math.min(1, value / channels.length));
        pcm.setInt16(
            2 * i,
            Math.round(value * (value < 0 ? 32768 : 32767)),
            true,
        );
    }
    return pcmToWav(new Uint8Array(pcm.buffer), sampleRate);
}
