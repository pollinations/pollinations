export type VadEvent =
    | "speech_started"
    | "speech_stopped"
    | "input_audio_buffer.committed"
    | "input_audio_buffer.cleared";

export interface TranscriptionDelta {
    type: "transcript.delta";
    item_id: string;
    delta: string;
}

export interface TranscriptionCompleted {
    type: "transcript.completed";
    item_id: string;
    transcript: string;
}

export type TranscriptionEvent = TranscriptionDelta | TranscriptionCompleted;

export function isTranscriptionDelta(e: unknown): e is TranscriptionDelta {
    return (
        typeof e === "object" &&
        e !== null &&
        (e as { type?: unknown }).type === "transcript.delta" &&
        typeof (e as { item_id?: unknown }).item_id === "string" &&
        typeof (e as { delta?: unknown }).delta === "string"
    );
}

export function isTranscriptionCompleted(
    e: unknown,
): e is TranscriptionCompleted {
    return (
        typeof e === "object" &&
        e !== null &&
        (e as { type?: unknown }).type === "transcript.completed" &&
        typeof (e as { item_id?: unknown }).item_id === "string" &&
        typeof (e as { transcript?: unknown }).transcript === "string"
    );
}

export function clearInputAudioBuffer(): { type: "input_audio_buffer.clear" } {
    return { type: "input_audio_buffer.clear" };
}

export class SegmentManager {
    private segments = new Map<string, string>();

    appendDelta(itemId: string, delta: string): string {
        const prev = this.segments.get(itemId) ?? "";
        const next = prev + delta;
        this.segments.set(itemId, next);
        return next;
    }

    complete(itemId: string, transcript?: string): string {
        const final = transcript ?? this.segments.get(itemId) ?? "";
        this.segments.set(itemId, final);
        return final;
    }

    get(itemId: string): string | undefined {
        return this.segments.get(itemId);
    }

    remove(itemId: string): void {
        this.segments.delete(itemId);
    }

    clear(): void {
        this.segments.clear();
    }
}
