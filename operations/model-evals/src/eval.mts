/**
 * Shared shape of an eval, plus the grader.
 *
 * An eval is only "questions + grading": the runner, the report, the CLI and the
 * website all iterate over whatever is registered here, so adding a second eval
 * later means adding one module to `evals/` and nothing else.
 */

export type EvalQuestion = {
    id: string;
    family: string;
    variant: string;
    prompt: string;
    expectedAnswer: number;
    answerFormat: "number" | "decimal";
    meta: Record<string, number | string>;
};

export type EvalGrade = {
    ok: boolean;
    answer: number | null;
    /** True when the model followed the requested `### Answer:` format. */
    formatted: boolean;
};

export type EvalDefinition = {
    id: string;
    title: string;
    description: string;
    version: number;
    source: string;
    families: readonly string[];
    /** Deterministic: the same seed must always produce the same quiz. */
    questions: (options: { seed: number; perFamily: number }) => EvalQuestion[];
    grade: (question: EvalQuestion, response: string) => EvalGrade;
};

/**
 * What the prompts ask the model to emit. The AIW reference prompts are strict
 * about this ("DO NOT OUTPUT ANY TEXT EXCEPT..."), so the graders of the paper
 * read the same marker; keeping it identical is what makes our numbers
 * comparable to the published ones.
 */
export const ANSWER_MARKER = "### Answer:";

export const RESTRICTED_FORMAT_INSTRUCTION = `To answer the question, DO NOT OUTPUT ANY TEXT EXCEPT following format that contains final answer: ${ANSWER_MARKER}`;

const ANSWER_MARKER_PATTERN = /###\s*answer\s*:/gi;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

function lastNumberIn(text: string): number | null {
    const matches = text.match(NUMBER_PATTERN);
    if (!matches || matches.length === 0) {
        return null;
    }
    const value = Number.parseFloat(matches[matches.length - 1]);
    return Number.isFinite(value) ? value : null;
}

/**
 * Read the final answer out of a model response.
 *
 * The last `### Answer:` marker wins: models sometimes restate the instruction or
 * show a scratch pad first, and the graded answer is the one they finish with. A
 * response that ignores the format entirely still gets read from its last number,
 * and is reported as unformatted so the leaderboard can show the difference.
 */
export function parseAnswerNumber(response: string): {
    value: number | null;
    formatted: boolean;
} {
    if (typeof response !== "string" || response.length === 0) {
        return { value: null, formatted: false };
    }
    let markerEnd = -1;
    ANSWER_MARKER_PATTERN.lastIndex = 0;
    for (
        let match = ANSWER_MARKER_PATTERN.exec(response);
        match !== null;
        match = ANSWER_MARKER_PATTERN.exec(response)
    ) {
        markerEnd = match.index + match[0].length;
    }
    if (markerEnd >= 0) {
        const tail = response.slice(markerEnd).match(NUMBER_PATTERN);
        if (!tail || tail.length === 0) {
            return { value: null, formatted: true };
        }
        const value = Number.parseFloat(tail[0]);
        return {
            value: Number.isFinite(value) ? value : null,
            formatted: true,
        };
    }
    return { value: lastNumberIn(response), formatted: false };
}

const NUMERIC_TOLERANCE = 1e-6;

export function gradeAnswer(
    question: EvalQuestion,
    response: string,
): EvalGrade {
    const { value, formatted } = parseAnswerNumber(response);
    const ok =
        value !== null &&
        Math.abs(value - question.expectedAnswer) < NUMERIC_TOLERANCE;
    return { ok, answer: value, formatted };
}
