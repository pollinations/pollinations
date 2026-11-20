/** Wrap mono, signed 16-bit little-endian PCM in a WAV container. */
export function pcmToWav(
    pcm: Uint8Array,
    sampleRate: number,
): Uint8Array<ArrayBuffer> {
    const wav = new Uint8Array(44 + pcm.byteLength);
    const view = new DataView(wav.buffer);
    const writeAscii = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i++) {
            wav[offset + i] = value.charCodeAt(i);
        }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeAscii(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    wav.set(pcm, 44);
    return wav;
}
