import { describe, expect, it } from "vitest";
import { decisionForm } from "./decision";

describe("Decide form", () => {
    const model = "typesafe/jev-1.14";
    it("uses a supported question when opening a link to a limited model", () => {
        const form = decisionForm("respan/span-01-lite", {
            questionType: "score",
        });
        expect(form.types).toEqual(["noul"]);
        expect(form.question?.type).toBe("noul");
    });
    it("does not offer an unverified model", () => {
        expect(decisionForm("unknown", {}).question).toBeUndefined();
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
