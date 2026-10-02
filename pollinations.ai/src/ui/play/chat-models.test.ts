import type { ModelInfo } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    agentChoices,
    FLORET_MODEL_ID,
    selectedAgentChoice,
} from "./chat-models";

function model(overrides: Partial<ModelInfo>): ModelInfo {
    return {
        id: "model-id",
        name: "model-id",
        title: "Model",
        category: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions", "/v1/responses"],
        ...overrides,
    };
}

describe("chat agents", () => {
    it("keeps canonical production agent IDs from the public catalog", () => {
        const choices = agentChoices([
            model({
                id: undefined,
                name: "community/pollinations-ai/floret",
                title: "Floret",
                agent: true,
            }),
            model({
                id: undefined,
                name: "community/pollinations-router/polli",
                title: "Polli",
                agent: true,
            }),
        ]);
        expect(choices.map(({ id }) => id)).toEqual([
            FLORET_MODEL_ID,
            "community/pollinations-router/polli",
        ]);
    });

    it("defaults to Floret regardless of catalog order", () => {
        const agents = agentChoices([
            model({ id: "another-agent", agent: true }),
            model({
                id: "community/pollinations-ai/floret",
                title: "Floret",
                agent: true,
            }),
        ]);
        expect(selectedAgentChoice(agents, null)?.id).toBe(FLORET_MODEL_ID);
        expect(selectedAgentChoice([...agents].reverse(), null)?.id).toBe(
            FLORET_MODEL_ID,
        );
    });

    it("preserves an explicit choice when Floret arrives or the catalog reorders", () => {
        const other = agentChoices([
            model({ id: "chosen-agent", agent: true }),
        ]);
        const floret = agentChoices([
            model({ id: FLORET_MODEL_ID, agent: true }),
        ]);
        for (const agents of [
            other,
            [...other, ...floret],
            [...floret, ...other],
        ]) {
            expect(selectedAgentChoice(agents, "chosen-agent")?.id).toBe(
                "chosen-agent",
            );
        }
    });

    it("requires a new selection when the preferred or explicitly selected agent is absent", () => {
        const other = agentChoices([
            model({ id: "another-agent", agent: true }),
        ]);
        expect(selectedAgentChoice([], null)).toBeUndefined();
        expect(selectedAgentChoice(other, null)).toBeUndefined();
        expect(
            selectedAgentChoice(
                agentChoices([model({ id: FLORET_MODEL_ID, agent: true })]),
                "removed-agent",
            ),
        ).toBeUndefined();
    });

    it("does not mistake an old Floret ID or a matching title for the canonical agent", () => {
        const agents = agentChoices([
            model({
                id: "community/pollinations-router/floret",
                title: "Floret",
                agent: true,
            }),
            model({ id: "unrelated/floret", title: "Floret", agent: true }),
        ]);
        expect(selectedAgentChoice(agents, null)).toBeUndefined();
    });
    it("lists only agents that serve the Responses API", () => {
        expect(
            agentChoices([
                model({ id: "responses-agent", agent: true }),
                model({
                    id: "chat-only-agent",
                    agent: true,
                    supported_endpoints: ["/v1/chat/completions"],
                }),
                model({
                    id: "unknown-endpoints",
                    agent: true,
                    supported_endpoints: undefined,
                }),
            ]).map(({ id }) => id),
        ).toEqual(["responses-agent"]);
    });

    it("lists only catalog models explicitly marked as agents", () => {
        const choices = agentChoices([
            model({ id: "regular", title: "Regular" }),
            model({
                id: "coding-agent",
                title: "Coding Agent",
                agent: true,
            }),
            model({
                id: undefined,
                name: "community-agent",
                title: "Community Agent",
                agent: true,
                input_modalities: ["text", "image"],
            }),
        ]);

        expect(choices).toEqual([
            {
                id: "coding-agent",
                title: "Coding Agent",
                inputModalities: ["text"],
            },
            {
                id: "community-agent",
                title: "Community Agent",
                inputModalities: ["text", "image"],
            },
        ]);
    });
});
