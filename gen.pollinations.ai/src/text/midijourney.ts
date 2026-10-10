import { resolveModelName } from "@shared/registry/registry.ts";
import { parseDocument, stringify } from "yaml";
import type { ChatCompletion, ServiceError } from "./types.js";

/** Identity-only aliases share the legacy device contract; community agents do not. */
export function isLegacyMidiJourney(model: string | undefined): boolean {
    if (!model) return false;
    try {
        const canonical = resolveModelName(model);
        return (
            canonical === "pollinations/midijourney" ||
            canonical === "pollinations/midijourney-large"
        );
    } catch {
        return false;
    }
}

function invalidResult(): never {
    const error = new Error(
        "MIDIjourney did not return one complete, valid musical result",
    ) as ServiceError;
    error.status = 502;
    error.errorCode = "INVALID_MIDI_RESULT";
    throw error;
}

const HEADER = "pitch,time,duration,velocity";

function musicalPayload(source: string): Record<string, unknown> | undefined {
    try {
        const doc = parseDocument(source, { schema: "core", uniqueKeys: true });
        if (doc.errors.length) return undefined;
        const value = doc.toJS({ maxAliasCount: 0 });
        if (!value || typeof value !== "object" || Array.isArray(value))
            return undefined;
        const { title, notation, duration, key, explanation } = value;
        if (
            typeof title !== "string" ||
            !title.trim() ||
            typeof notation !== "string" ||
            !notation.trim()
        )
            return undefined;
        if (
            duration !== undefined &&
            (typeof duration !== "number" ||
                !Number.isFinite(duration) ||
                duration <= 0)
        )
            return undefined;
        if (key !== undefined && typeof key !== "string") return undefined;
        if (explanation !== undefined && typeof explanation !== "string")
            return undefined;
        const lines = notation.trimEnd().split(/\r?\n/);
        if (lines.shift() !== HEADER || !lines.length) return undefined;
        for (const line of lines) {
            const cells = line.split(",");
            if (cells.length !== 4 || cells.some((cell) => !cell.trim()))
                return undefined;
            const [pitch, time, length, velocity] = cells.map(Number);
            if (
                ![pitch, time, length, velocity].every(Number.isFinite) ||
                !Number.isInteger(pitch) ||
                pitch < 0 ||
                pitch > 127 ||
                time < 0 ||
                length <= 0 ||
                !Number.isInteger(velocity) ||
                velocity < 0 ||
                velocity > 127
            )
                return undefined;
        }
        // Preserve the CSV verbatim: no sorting, rounding, clamping, or dropped rows.
        return {
            title,
            ...(duration !== undefined ? { duration } : {}),
            ...(key !== undefined ? { key } : {}),
            ...(explanation !== undefined ? { explanation } : {}),
            notation,
        };
    } catch {
        return undefined;
    }
}

function serializePayload(payload: Record<string, unknown>): string {
    const { notation, ...metadata } = payload;
    // V2 looks for the first fence even inside YAML strings. Escape backticks
    // in quoted metadata so an explanation cannot masquerade as a code block.
    return (
        Object.entries(metadata)
            .map(
                ([key, value]) =>
                    `${key}: ${JSON.stringify(value).replaceAll("`", "\\u0060")}\n`,
            )
            .join("") +
        stringify({ notation }, { lineWidth: 0, blockQuote: "literal" })
    );
}

/** Accept a raw document or exactly one musical YAML block in final assistant text. */
export function formatMidiJourneyResult(text: unknown): string {
    if (typeof text !== "string") return invalidResult();
    const raw = musicalPayload(text);
    if (raw) return serializePayload(raw);
    const blocks = [
        ...text.matchAll(/^```(?:yaml|yml)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm),
    ];
    if (blocks.length !== 1) return invalidResult();
    const payload = musicalPayload(blocks[0][1]);
    if (!payload) return invalidResult();
    return serializePayload(payload);
}

/** Select by protocol structure, never by a code block in a tool transcript. */
export function finalMidiJourneyMessage(
    output: Record<string, unknown>[],
): string {
    const last = output.at(-1);
    if (
        !last ||
        last.type !== "message" ||
        last.role !== "assistant" ||
        last.status !== "completed" ||
        !Array.isArray(last.content)
    )
        return invalidResult();
    if (
        !last.content.length ||
        last.content.some(
            (part) =>
                !part ||
                typeof part !== "object" ||
                part.type !== "output_text" ||
                typeof part.text !== "string",
        )
    )
        return invalidResult();
    return formatMidiJourneyResult(
        last.content.map((part) => part.text).join(""),
    );
}

export function formatMidiJourneyCompletion(
    completion: ChatCompletion,
): ChatCompletion {
    if (!completion.choices?.length) return invalidResult();
    for (const choice of completion.choices) {
        if (
            choice.finish_reason !== "stop" ||
            choice.message?.role !== "assistant" ||
            choice.message.tool_calls?.length ||
            choice.message.refusal
        )
            return invalidResult();
        choice.message = {
            ...choice.message,
            content: formatMidiJourneyResult(choice.message.content),
        };
    }
    return completion;
}
