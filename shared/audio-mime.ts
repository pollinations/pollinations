export type AudioMimeType =
    | "audio/mpeg"
    | "audio/wav"
    | "audio/ogg"
    | "audio/flac"
    | "audio/mp4";

/** Detect common encoded audio containers by their magic bytes. */
export function detectAudioMimeType(bytes: Uint8Array): AudioMimeType | null {
    if (bytes.length < 12) return null;
    // MP3 with an ID3v2 tag ("ID3") or a bare MPEG audio frame sync (0xFF Ex).
    if (
        (bytes[0] === 0x49 &&
            bytes[1] === 0x44 &&
            bytes[2] === 0x33 &&
            bytes[3] < 0xff) ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    ) {
        return "audio/mpeg";
    }
    // RIFF....WAVE — the only RIFF form accepted as audio.
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x41 &&
        bytes[10] === 0x56 &&
        bytes[11] === 0x45
    ) {
        return "audio/wav";
    }
    // OggS page capture pattern.
    if (
        bytes[0] === 0x4f &&
        bytes[1] === 0x67 &&
        bytes[2] === 0x67 &&
        bytes[3] === 0x53
    ) {
        return "audio/ogg";
    }
    // "fLaC" stream marker.
    if (
        bytes[0] === 0x66 &&
        bytes[1] === 0x4c &&
        bytes[2] === 0x61 &&
        bytes[3] === 0x43
    ) {
        return "audio/flac";
    }
    // AAC commonly ships in an MP4 (ISO-BMFF) container.
    if (
        bytes[4] === 0x66 &&
        bytes[5] === 0x74 &&
        bytes[6] === 0x79 &&
        bytes[7] === 0x70
    ) {
        return "audio/mp4";
    }
    return null;
}
