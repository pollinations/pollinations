// Grading for the AIW eval families. Answers are extracted from the model
// response and compared against the code-computed answer — no LLM grading.
//
// The extraction follows LAION's convention: the number after "answer:",
// preferring the "### Answer:" marker the prompts ask for. When a model
// ignores the format, the last standalone number in the response is used as
// a last resort, mirroring how a human would read a free-form reply.

const ANSWER_MARKER =
    /answer\s*[:#]?\s*(?:###)?\s*\**\s*\(?\s*(-?\d+(?:\.\d+)?)/i;
const LAST_NUMBER = /(-?\d+(?:\.\d+)?)(?![^\n]*\d)/;

export function parseAnswer(response) {
    if (typeof response !== "string" || response.trim() === "") return null;
    const text = response.replace(/\n/g, " ");

    const markerMatch = text.match(ANSWER_MARKER);
    if (markerMatch) {
        const value = Number.parseFloat(markerMatch[1]);
        if (Number.isFinite(value)) return value;
    }

    // Free-form fallback: the last number in the response.
    const lastMatch = text.match(LAST_NUMBER);
    if (lastMatch) {
        const value = Number.parseFloat(lastMatch[1]);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

export function isCorrect(parsed, expected) {
    if (parsed === null || parsed === undefined) return false;
    return parsed === expected;
}
