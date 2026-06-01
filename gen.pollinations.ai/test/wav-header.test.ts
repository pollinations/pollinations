import { describe, expect, it } from "vitest";
import { fixWavHeader } from "../src/routes/audio.ts";

/** Build a minimal RIFF/WAVE buffer: 44-byte header + `dataBytes` of payload,
 *  with the data-chunk size and RIFF size set to `declared`. */
function makeWav(dataBytes: number, declared: number): ArrayBuffer {
    const buf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buf);
    const ascii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++)
            view.setUint8(offset + i, s.charCodeAt(i));
    };
    ascii(0, "RIFF");
    view.setUint32(4, declared, true); // RIFF chunk size (intentionally wrong)
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    ascii(36, "data");
    view.setUint32(40, declared, true); // data chunk size (intentionally wrong)
    return buf;
}

describe("fixWavHeader", () => {
    it("rewrites the placeholder data/RIFF sizes to the real byte counts", () => {
        const dataBytes = 1000;
        const fixed = fixWavHeader(makeWav(dataBytes, 0x7fffffff));
        const view = new DataView(fixed);
        expect(view.getUint32(40, true)).toBe(dataBytes); // data chunk size
        expect(view.getUint32(4, true)).toBe(44 + dataBytes - 8); // RIFF size
    });

    it("is a no-op when the header is already correct", () => {
        const dataBytes = 512;
        const correct = makeWav(dataBytes, dataBytes); // data size already right
        const view = new DataView(correct);
        view.setUint32(4, 44 + dataBytes - 8, true); // RIFF size already right too
        const fixed = fixWavHeader(correct);
        expect(new DataView(fixed).getUint32(40, true)).toBe(dataBytes);
        expect(new DataView(fixed).getUint32(4, true)).toBe(44 + dataBytes - 8);
    });

    it("returns non-RIFF buffers unchanged", () => {
        const buf = new TextEncoder().encode(
            "not a wav file at all xxxxxxxxxx",
        ).buffer;
        expect(fixWavHeader(buf)).toBe(buf);
    });

    it("returns buffers shorter than a WAV header unchanged", () => {
        const buf = new ArrayBuffer(10);
        expect(fixWavHeader(buf)).toBe(buf);
    });
});
