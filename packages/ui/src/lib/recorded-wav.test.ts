import { expect, it } from "vitest";
import { encodeRecordedWav } from "./recorded-wav.ts";

it("keeps the start of a recording up to the last whole PCM sample that fits", () => {
    const channels = [Float32Array.of(-1, 1, 0.5)];
    const wav = encodeRecordedWav(channels, 44100, 49);
    const view = new DataView(wav.buffer);

    expect(wav.byteLength).toBe(48);
    expect(view.getUint32(40, true)).toBe(4);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(encodeRecordedWav(channels, 44100, 1000)).toHaveLength(50);
    expect(() => encodeRecordedWav(channels, 44100, 45)).toThrow();
});
