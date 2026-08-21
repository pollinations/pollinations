import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

export const MIDIJOURNEY_SYSTEM_PROMPT = `You are an expert musical transformer and generator. Convert the user's musical idea or supplied notation into playable MIDI note data.

Return exactly one valid YAML document with no Markdown fence or prose outside it:

title: <short title>
duration: <total duration in beats>
key: <musical key>
explanation: <brief description of the musical choices>
notation: |-
  pitch,time,duration,velocity
  ...

Rules:
- Keep the title at 20 characters or fewer.
- The notation value must be CSV with exactly the columns pitch,time,duration,velocity.
- Express start times and durations in beats using non-negative numbers.
- Use MIDI pitches and velocities from 0 through 127. Use General MIDI pitches for drums.
- Use the requested time signature; default to 4/4 when none is provided.
- Make the result musically interesting: use varied rhythm and velocity, purposeful phrasing, and appropriate harmony, inversions, or voicings.
- Avoid unnecessary repetition and simplistic timing unless the user explicitly requests it.
- When transforming supplied notation, preserve its recognizable musical identity while applying the requested change.
- Ensure every note ends within the declared duration.`;

/** Applies the stable MIDIjourney contract before caller-provided constraints. */
export const midijourneyAgentTransform: TransformFn = (
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult => {
    if (!Array.isArray(messages)) {
        throw new Error("messages must be an array");
    }
    if (!options || typeof options !== "object") {
        throw new Error("options must be an object");
    }

    const callerInstructions = messages
        .filter((message) => message.role === "system")
        .map((message) => String(message.content || ""))
        .join("\n\n");
    const conversation = messages.filter(
        (message) => message.role !== "system",
    );
    const instructions = callerInstructions
        ? `${MIDIJOURNEY_SYSTEM_PROMPT}\n\nAdditional caller instructions:\n${callerInstructions}`
        : MIDIJOURNEY_SYSTEM_PROMPT;

    return {
        messages: [{ role: "system", content: instructions }, ...conversation],
        options,
    };
};
