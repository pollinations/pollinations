import { describe, expect, it } from "vitest";
import { getTextModelsInfo } from "../../../../shared/registry/model-info";
import overrides from "../../data/playground-model-overrides.json";
import { decisionForm } from "./decision";

describe("Decide form", () => {
    const model = "typesafe/jev-1.14";
    it("keeps the verified question types on public decision models", () => {
        const models = new Map(
            getTextModelsInfo().map((model) => [model.name, model]),
        );
        for (const [id, override] of Object.entries(overrides)) {
            const entry = models.get(id);
            expect(entry?.category, id).toBe("decision");
            expect(entry?.supported_endpoints, id).toContain(
                "/alpha/decisions",
            );
            expect(override.reason.trim(), id).toBeTruthy();
            expect(override.source.trim(), id).toBeTruthy();
            expect(decisionForm(id, {}).types, id).toEqual(
                override.decisionQuestionTypes,
            );
        }
    });
    it("uses a supported question when opening a link to a limited model", () => {
        const form = decisionForm("respan/span-01-lite", {
            questionType: "score",
        });
        expect(form.types).toEqual(["noul"]);
        expect(form.question?.type).toBe("noul");
    });
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
