// Question generators and graders for the weekly model evals.
//
// Each family is a small common-sense arithmetic puzzle in the spirit of the
// LAION "Alice in Wonderland" paper (https://arxiv.org/abs/2406.02061): easy
// for a human, but prone to tripping up pattern-matching instead of actual
// reasoning. Numbers are randomized per call so cached/memorized answers
// don't score.

export const FAMILIES = ["aiw", "aiw_plus", "bowls"];

const ANSWER_INSTRUCTION =
    "Think it through, then end your reply with a new line in exactly this " +
    "format: Final answer: <integer>";

function randomInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}

// AIW: "Alice has N brothers and M sisters. How many sisters does Alice's
// brother have?" Correct answer is M + 1 (Alice herself plus her sisters).
export function generateAiw(rng) {
    const brothers = randomInt(rng, 1, 6);
    const sisters = randomInt(rng, 1, 6);
    return {
        family: "aiw",
        prompt:
            `Alice has ${brothers} brothers and she also has ${sisters} sisters. ` +
            `How many sisters does Alice's brother have? ${ANSWER_INSTRUCTION}`,
        answer: sisters + 1,
    };
}

// AIW+: same question, wrapped in irrelevant relative counts (aunts/uncles)
// that don't change the answer — the paper's control for whether models are
// pattern-matching on sentence shape rather than reasoning about who's who.
export function generateAiwPlus(rng) {
    const brothers = randomInt(rng, 1, 6);
    const sisters = randomInt(rng, 1, 6);
    const fathersSisters = randomInt(rng, 1, 4);
    const mothersBrothers = randomInt(rng, 1, 4);
    return {
        family: "aiw_plus",
        prompt:
            `Alice has ${brothers} brothers and ${sisters} sisters. ` +
            `Alice's father has ${fathersSisters} sisters of his own, and Alice's mother has ${mothersBrothers} brothers of her own. ` +
            `How many sisters does one of Alice's brothers have? ${ANSWER_INSTRUCTION}`,
        answer: sisters + 1,
    };
}

// Bowls: a counting task with one distractor bowl holding a different
// amount, testing whether the model tracks state instead of guessing a
// round number.
export function generateBowls(rng) {
    const empty = randomInt(rng, 1, 3);
    const normalBowls = randomInt(rng, 2, 5);
    const totalBowls = empty + normalBowls + 1; // +1 for the special bowl
    const perBowl = randomInt(rng, 2, 8);
    const specialBowl = randomInt(rng, 1, 8);
    return {
        family: "bowls",
        prompt:
            `There are ${totalBowls} bowls on a table. ${empty} of the bowls are empty. ` +
            `Each of the remaining bowls contains ${perBowl} pieces of fruit, except for one bowl, ` +
            `which instead contains ${specialBowl} pieces of fruit. ` +
            `How many pieces of fruit are on the table in total? ${ANSWER_INSTRUCTION}`,
        answer: normalBowls * perBowl + specialBowl,
    };
}

const GENERATORS = {
    aiw: generateAiw,
    aiw_plus: generateAiwPlus,
    bowls: generateBowls,
};

export function generateQuestion(family, rng) {
    const generator = GENERATORS[family];
    if (!generator) {
        throw new Error(`Unknown eval family: ${family}`);
    }
    return generator(rng);
}

// Pulls "Final answer: 4" (or the last bare integer as a fallback) out of a
// model's free-form reply.
export function extractAnswer(text) {
    if (!text) return null;
    const labeled = text.match(/final answer[:\s]*(-?\d+)/i);
    if (labeled) return Number.parseInt(labeled[1], 10);
    const allIntegers = text.match(/-?\d+/g);
    if (!allIntegers) return null;
    return Number.parseInt(allIntegers[allIntegers.length - 1], 10);
}

export function gradeAnswer(question, replyText) {
    const extracted = extractAnswer(replyText);
    return extracted !== null && extracted === question.answer;
}

// 95% Wilson score interval half-width for a proportion of `correct`/`total`.
// Wilson stays sane at the small trial counts an eval run uses, unlike the
// normal approximation which breaks down near p=0 or p=1.
export function marginOfError(correct, total, z = 1.96) {
    if (total === 0) return 0;
    const p = correct / total;
    const denom = 1 + (z * z) / total;
    const halfWidth =
        (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
        denom;
    return halfWidth;
}
