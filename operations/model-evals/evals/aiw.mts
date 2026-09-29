/**
 * Alice in Wonderland (AIW) — the first eval.
 *
 * The prompts follow the LAION AIW suite (https://github.com/LAION-AI/AIW,
 * Apache-2.0, paper: arXiv 2406.02061) so the leaderboard numbers stay
 * comparable with the published ones. Three families are generated:
 *
 * - `aiw`     the siblings puzzle (the famous "Alice has 4 brothers and 1
 *             sister" trap, problems 1-2 of the paper).
 * - `aiwplus` the cousins puzzle (problem 3), built from a closed-form model
 *             that is checked against the paper's own worked example.
 * - `bowls`   the bowl-counting distractor puzzles (Bowls PLAIN and CONTROL).
 *
 * Every family regenerates its numbers from a fresh run seed, so the weekly
 * leaderboard is re-earned instead of replayed, and `--seed` reproduces a run.
 */

import {
    ANSWER_MARKER,
    type EvalDefinition,
    type EvalQuestion,
    gradeAnswer,
    RESTRICTED_FORMAT_INSTRUCTION,
} from "../src/eval.mts";
import { hashSeed, pick, randomInt, rngFrom } from "../src/random.mts";

function question(fields: {
    id: string;
    family: string;
    variant: string;
    prompt: string;
    expectedAnswer: number;
    answerFormat?: "number" | "decimal";
    meta?: Record<string, number | string>;
}): EvalQuestion {
    return {
        id: fields.id,
        family: fields.family,
        variant: fields.variant,
        prompt: fields.prompt,
        expectedAnswer: fields.expectedAnswer,
        answerFormat: fields.answerFormat ?? "number",
        meta: fields.meta ?? {},
    };
}

function plural(
    count: number,
    singular: string,
    pluralForm = `${singular}s`,
): string {
    return count === 1 ? singular : pluralForm;
}

/**
 * Siblings puzzle. Brothers are irrelevant on purpose: the answer only depends on
 * the number of sisters, because Alice's brother sees the same set of sisters
 * Alice does. Reference: LAION AIW "AIW VARIATION" prompts.
 */
function siblingsQuestions(seed: number, perFamily: number): EvalQuestion[] {
    const rng = rngFrom(hashSeed(seed, "aiw"));
    const questions: EvalQuestion[] = [];
    for (let index = 0; index < perFamily; index++) {
        const brothers = randomInt(rng, 2, 6);
        const sisters = randomInt(rng, 1, 4);
        questions.push(
            question({
                id: `aiw-${index + 1}`,
                family: "aiw",
                variant: "brothers-and-sisters",
                prompt: `Alice has ${brothers} brothers and she also has ${sisters} ${plural(sisters, "sister")}. How many sisters does Alice's brother have? ${RESTRICTED_FORMAT_INSTRUCTION}`,
                expectedAnswer: sisters + 1,
                meta: { brothers, sisters },
            }),
        );
    }
    return questions;
}

/**
 * Cousins puzzle (AIW+).
 *
 * Reading the paper's prompt as a family tree, with C children of Alice's parents
 * (Alice and her S sisters), Cb children of the mother's brothers, Cx children of
 * the father's other siblings and K sons of the father's brother:
 *
 *   mother's sister: has no children, and her nieces/nephews are N1 = C + Cb
 *   father's brother: has K sons, and his nieces/nephews are N2 = C + Cx
 *   cousins of Alice's sister = Cb + Cx + K = (N1 - C) + (N2 - C) + K
 *
 * Paper example (S=3, N1=7, N2=5, K=1): 3 + 1 + 1 = 5 ✓ matches the published
 * answer. Cb and Cx are kept above zero so the puzzle always has exactly one
 * reading.
 */
export type CousinsPuzzle = {
    sisters: number;
    niecesMother: number;
    niecesFather: number;
    uncleSons: number;
};

/**
 * Closed form of the AIW+ puzzle: cousins of Alice's sister are the children of
 * the mother's brothers, the children of the father's other siblings, and the
 * father's brother's own sons.
 */
export function aiwPlusAnswer(puzzle: CousinsPuzzle): number {
    const children = puzzle.sisters + 1;
    const cousinsMother = puzzle.niecesMother - children;
    const cousinsFather = puzzle.niecesFather - children;
    return cousinsMother + cousinsFather + puzzle.uncleSons;
}

function cousinsQuestions(seed: number, perFamily: number): EvalQuestion[] {
    const rng = rngFrom(hashSeed(seed, "aiwplus"));
    const questions: EvalQuestion[] = [];
    for (let index = 0; index < perFamily; index++) {
        const sisters = randomInt(rng, 2, 5);
        const children = sisters + 1;
        const cousinsMother = randomInt(rng, 1, 4);
        const cousinsFather = randomInt(rng, 1, 3);
        const uncleSons = randomInt(rng, 1, 2);
        const motherBrothers = randomInt(rng, 1, 3);
        const niecesMother = children + cousinsMother;
        const niecesFather = children + cousinsFather;
        const puzzle: CousinsPuzzle = {
            sisters,
            niecesMother,
            niecesFather,
            uncleSons,
        };
        questions.push(
            question({
                id: `aiwplus-${index + 1}`,
                family: "aiwplus",
                variant: "cousins",
                prompt: `Alice has ${sisters} ${plural(sisters, "sister")}. Her mother has 1 sister who does not have children - she has ${niecesMother} ${plural(niecesMother, "nephew", "nephews")} and nieces and also ${motherBrothers} ${plural(motherBrothers, "brother")}. Alice's father has a brother who has ${niecesFather} ${plural(niecesFather, "nephew", "nephews")} and nieces in total, and who has also ${uncleSons} ${plural(uncleSons, "son")}. How many cousins does Alice's sister have? ${RESTRICTED_FORMAT_INSTRUCTION}`,
                expectedAnswer: aiwPlusAnswer(puzzle),
                meta: {
                    sisters,
                    niecesMother,
                    niecesFather,
                    uncleSons,
                    cousinsMother,
                    cousinsFather,
                },
            }),
        );
    }
    return questions;
}

/**
 * Bowls puzzles. A big bowl sits next to a pile of red and blue bowls; the
 * questions ask about either the colour group (where the big bowl counts when it
 * shares the colour) or the neighbours of the big bowl (where it does not).
 *
 *   grouped   "How many <colour> bowls are on the table with red bowls?"
 *   control   "How many bowls are on the table beside the big bowl?"
 */
function bowlsQuestions(seed: number, perFamily: number): EvalQuestion[] {
    const rng = rngFrom(hashSeed(seed, "bowls"));
    const questions: EvalQuestion[] = [];
    for (let index = 0; index < perFamily; index++) {
        const bigColor = pick(rng, ["blue", "red"] as const);
        const reds = randomInt(rng, 1, 4);
        const blues = randomInt(rng, 1, 4);
        const variant = index % 2 === 0 ? "grouped" : "control";
        if (variant === "control") {
            questions.push(
                question({
                    id: `bowls-${index + 1}`,
                    family: "bowls",
                    variant: "control",
                    prompt: `On a table, there is a big bowl, which is ${bigColor}, next to this bowl there are ${reds} ${plural(reds, "red bowl")} and ${blues} ${plural(blues, "blue bowl")} on the table. How many bowls are on the table beside the big bowl? Provide the final answer in following form: "${ANSWER_MARKER} ".`,
                    expectedAnswer: reds + blues,
                    meta: { bigColor, reds, blues },
                }),
            );
            continue;
        }
        const askedColor = pick(rng, ["red", "blue"] as const);
        const matching = askedColor === "red" ? reds : blues;
        questions.push(
            question({
                id: `bowls-${index + 1}`,
                family: "bowls",
                variant: "grouped",
                prompt: `On a table, there is a big bowl, next to this bowl, which is ${bigColor}, there are ${reds} ${plural(reds, "red bowl")} and ${blues} ${plural(blues, "blue bowl")} on the table. How many ${askedColor} bowls are on the table with red bowls? Provide the final answer in following form: "${ANSWER_MARKER} ".`,
                expectedAnswer: matching + (bigColor === askedColor ? 1 : 0),
                meta: { bigColor, reds, blues, askedColor },
            }),
        );
    }
    return questions;
}

export const AIW_FAMILIES = ["aiw", "aiwplus", "bowls"] as const;

export const aiwEval: EvalDefinition = {
    id: "aiw",
    title: "Alice in Wonderland",
    description:
        "Prompt-only reasoning puzzles from the LAION AIW suite: sibling counting, the AIW+ cousins puzzle and the Bowls distractor puzzles.",
    version: 1,
    source: "https://github.com/LAION-AI/AIW (Apache-2.0), paper arXiv:2406.02061",
    families: AIW_FAMILIES,
    questions: ({ seed, perFamily }) => [
        ...siblingsQuestions(seed, perFamily),
        ...cousinsQuestions(seed, perFamily),
        ...bowlsQuestions(seed, perFamily),
    ],
    grade: (question, response) => gradeAnswer(question, response),
};
