import { describe, expect, it } from "vitest";
import { playgroundModelOverride } from "../../data/playground-model-overrides";
import { decisionForm } from "./decision";

describe("Decide form", () => {
    const model = "typesafe/jev-1.14";
    it("uses a supported question when opening a link to a limited model", () => {
        expect(
            playgroundModelOverride("respan/span-01-lite")
                ?.decisionQuestionTypes,
        ).toEqual(["noul"]);
        const form = decisionForm("respan/span-01-lite", {
            questionType: "score",
        });
        expect(form.types).toEqual(["noul"]);
        expect(form.question?.type).toBe("noul");
    });
    it.each(["noul", "choice", "score"])(
        "builds a Gemini %s question",
        (type) => {
            expect(
                decisionForm("google/gemini-decision-1", { questionType: type })
                    .question?.type,
            ).toBe(type);
        },
    );
    it("starts a newly listed decision model with a yes-or-no question", () => {
        const form = decisionForm("unknown", { questionType: "score" });
        expect(form.types).toEqual(["noul"]);
        expect(form.question?.type).toBe("noul");
    });
    it("keeps the user's scale in order and trims empty lines", () => {
        expect(
            decisionForm(model, {
                questionType: "score",
                question: " How urgent? ",
                levels: "Low\n\n High ",
            }).question,
        ).toEqual({
            type: "score",
            instructions: "How urgent?",
            criteria: ["Low", "High"],
        });
    });
    it("sends choices by name and blocks duplicate or missing entries", () => {
        expect(
            decisionForm(model, { questionType: "choice", choices: "Yes\nNo" })
                .question,
        ).toMatchObject({ criteria: { Yes: "Yes", No: "No" } });
        for (const choices of ["", "Only", "A\nA"]) {
            expect(
                decisionForm(model, { questionType: "choice", choices })
                    .question,
            ).toBeUndefined();
        }
        expect(decisionForm(model, { question: " " }).error).toBeTruthy();
    });
});
