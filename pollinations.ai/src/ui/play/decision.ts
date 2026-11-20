import type { DecisionQuestion } from "@pollinations/sdk";
import { playgroundModelOverride } from "../../data/playground-model-overrides";
import type { PlaySearch } from "../../routes/-play-search";

export const URGENCY_EXAMPLE =
    "My export failed twice, and I need it for a meeting in ten minutes.";

const questionTypes = ["noul", "choice", "score"] as const;
type QuestionType = DecisionQuestion["type"];
const labels: Record<QuestionType, string> = {
    noul: "Yes / No",
    choice: "Choose one",
    score: "Score",
};
export function questionTypeLabel(type: string) {
    return labels[type as QuestionType];
}

export function decisionModelId(
    selected: string,
    models: readonly { id: string; paidOnly: boolean }[],
    allowed?: ReadonlySet<string>,
) {
    if (selected) return selected;
    const available = allowed
        ? models.filter((model) => allowed.has(model.id))
        : models;
    return (available.find((model) => !model.paidOnly) ?? available[0])?.id;
}

function decisionQuestionTypes(model: string) {
    const verified = playgroundModelOverride(model)?.decisionQuestionTypes;
    return verified
        ? questionTypes.filter((type) => verified.includes(type))
        : ["noul" as const];
}

export function decisionForm(model: string, params: PlaySearch) {
    const types = decisionQuestionTypes(model);
    const type = types.find((type) => type === params.questionType) ?? types[0];
    const instructions =
        params.question ??
        (type === "choice"
            ? "Which team should handle this?"
            : type === "score"
              ? "How urgent is this?"
              : "Does this need urgent attention?");
    const criteria = (
        type === "score"
            ? (params.levels ?? "Low\nMedium\nHigh")
            : (params.choices ?? "Billing\nTechnical support")
    ).split("\n");
    const options = criteria.map((s) => s.trim()).filter(Boolean);
    let question: (DecisionQuestion & { instructions: string }) | undefined;
    let error: string | undefined;
    if (!type) error = "No verified question types for this model.";
    else if (!instructions.trim()) error = "Enter a question.";
    else if (type === "noul")
        question = { type, instructions: instructions.trim() };
    else if (new Set(options).size !== options.length || options.length < 2)
        error = "Enter at least two distinct options.";
    else if (type === "choice")
        question = {
            type,
            instructions: instructions.trim(),
            criteria: Object.fromEntries(
                options.map((option) => [option, option]),
            ),
        };
    else
        question = {
            type,
            instructions: instructions.trim(),
            criteria: options,
        };
    return { types, type, instructions, criteria, question, error };
}
