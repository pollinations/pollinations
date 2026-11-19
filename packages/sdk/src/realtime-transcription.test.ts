import { describe, expect, it } from "vitest";
import {
    clearInputAudioBuffer,
    isTranscriptionCompleted,
    isTranscriptionDelta,
    SegmentManager,
} from "./realtime-transcription.js";

describe("realtime-transcription", () => {
    it("guards delta", () => {
        expect(
            isTranscriptionDelta({
                type: "transcript.delta",
                item_id: "a",
                delta: "hi",
            }),
        ).toBe(true);
        expect(isTranscriptionDelta({ type: "x" })).toBe(false);
    });
    it("guards completed", () => {
        expect(
            isTranscriptionCompleted({
                type: "transcript.completed",
                item_id: "a",
                transcript: "hi",
            }),
        ).toBe(true);
    });
    it("clear buffer", () => {
        expect(clearInputAudioBuffer()).toEqual({
            type: "input_audio_buffer.clear",
        });
    });
    it("segment manager", () => {
        const m = new SegmentManager();
        m.appendDelta("1", "he");
        m.appendDelta("1", "llo");
        expect(m.get("1")).toBe("hello");
        expect(m.complete("1")).toBe("hello");
        m.remove("1");
        expect(m.get("1")).toBeUndefined();
    });
});
