/**
 * The eval registry.
 *
 * The quest asked for future evals to cost "questions + grading" and nothing
 * else: register the module here and the CLI, the report and the website pick it
 * up on their own.
 */

import type { EvalDefinition } from "../src/eval.mts";
import { aiwEval } from "./aiw.mts";

export const EVALS: readonly EvalDefinition[] = [aiwEval];

export const DEFAULT_EVAL_ID = aiwEval.id;

export function listEvalIds(): string[] {
    return EVALS.map((definition) => definition.id);
}

export function findEval(id: string): EvalDefinition {
    const definition = EVALS.find((candidate) => candidate.id === id);
    if (!definition) {
        throw new Error(
            `Unknown eval "${id}". Available evals: ${listEvalIds().join(", ")}.`,
        );
    }
    return definition;
}

export { aiwEval };
export type { EvalDefinition, EvalGrade, EvalQuestion } from "../src/eval.mts";
