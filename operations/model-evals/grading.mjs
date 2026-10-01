// Grading for the AIW eval families. Answers are extracted from the model
// response and compared against the code-computed answer — no LLM grading.
//
// The extraction follows LAION's convention: the number after "answer:",
// preferring the "### Answer:" marker the prompts ask for. When a model
// ignores the format, the last standalone number in the response is used as
// a last resort, mirroring how a human would read a free-form reply.

const NUMBER_TOKEN =
    /[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[-+]?\d+)?(?:\/\d+(?:\.\d+)?)?/gi;
const ANSWER_MARKER = /(?:###\s*)?answer\s*[:#]/gi;

function numericValue(token) {
    if (!token || token.includes("/")) return null;
    const value = Number(token.replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
}

export function parseAnswer(response) {
    if (typeof response !== "string" || response.trim() === "") return null;
    const markers = [...response.matchAll(ANSWER_MARKER)];
    if (markers.length > 0) {
        // Prefer the final explicit answer, not a preliminary result in reasoning.
        const marker = markers[markers.length - 1];
        const tail = response
            .slice(marker.index + marker[0].length)
            .replace(/^[\s*"'(]+/, "");
        const match = tail.match(NUMBER_TOKEN);
        if (!match || !tail.startsWith(match[0])) return null;
        return numericValue(match[0]);
    }
    const numbers = response.match(NUMBER_TOKEN);
    return numericValue(numbers?.[numbers.length - 1]);
}

export function isCorrect(parsed, expected) {
    if (parsed === null || parsed === undefined) return false;
    return parsed === expected;
}
