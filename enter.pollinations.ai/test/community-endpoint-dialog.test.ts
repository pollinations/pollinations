import { afterAll, describe, expect, it, vi } from "vitest";
import { getAgentSubmitDisabledReason } from "../frontend/src/components/community-endpoints/agent-dialog.tsx";
import { getCommunityEndpointSubmitDisabledReason } from "../frontend/src/components/community-endpoints/community-endpoint-dialog.tsx";
import {
    type AgentFormState,
    type EndpointFormState,
    emptyAgentForm,
    emptyForm,
    idleAction,
} from "../frontend/src/components/community-endpoints/types.ts";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const validForm: EndpointFormState = {
    ...emptyForm,
    name: "my-model",
    title: "My Model",
    url: "https://api.example.com/v1",
    bearerToken: "sk-test",
};

type EndpointInput = Parameters<
    typeof getCommunityEndpointSubmitDisabledReason
>[0];

const endpointReason = (overrides: Partial<EndpointInput>) =>
    getCommunityEndpointSubmitDisabledReason({
        form: validForm,
        isEdit: false,
        isEndpointAgent: false,
        hasToken: true,
        needsTest: false,
        testState: idleAction,
        testRequirementMet: false,
        hasValidVisiblePrices: true,
        hasValidPerUserRpm: true,
        ...overrides,
    });

describe("getCommunityEndpointSubmitDisabledReason", () => {
    it.each<[string, Partial<EndpointInput>, string]>([
        ["model id", { form: { ...validForm, name: "" } }, "Enter a model ID"],
        [
            "agent id",
            { form: { ...validForm, name: "" }, isEndpointAgent: true },
            "Enter an agent ID",
        ],
        ["title", { form: { ...validForm, title: "   " } }, "Enter a title"],
        ["url", { form: { ...validForm, url: "" } }, "Enter an endpoint URL"],
        [
            "video url",
            { form: { ...validForm, url: "", modality: "video" } },
            "Enter a video endpoint URL",
        ],
        ["token", { hasToken: false }, "Enter an API bearer token"],
        [
            "token before publishing",
            { isEdit: true, hasToken: false, needsTest: true },
            "Re-enter your API bearer token and test the endpoint before publishing",
        ],
        [
            "untested",
            { isEdit: true, needsTest: true },
            "Test the endpoint before publishing",
        ],
        [
            "test running",
            {
                isEdit: true,
                needsTest: true,
                testState: { status: "loading", message: "Testing..." },
            },
            "Waiting for endpoint test to complete",
        ],
        [
            "test failed",
            {
                isEdit: true,
                needsTest: true,
                testState: { status: "error", message: "Connection refused" },
            },
            "Endpoint test failed. Fix errors and test again before publishing",
        ],
        [
            "prices",
            { hasValidVisiblePrices: false },
            "Enter valid pricing values (or leave blank for free)",
        ],
        [
            "rpm",
            { hasValidPerUserRpm: false },
            "Enter a valid per-user RPM limit",
        ],
        ["fallback", {}, "Complete all required fields to save"],
    ])("explains a missing %s", (_, overrides, reason) => {
        expect(endpointReason(overrides)).toBe(reason);
    });
});

describe("getAgentSubmitDisabledReason", () => {
    const agent: AgentFormState = {
        ...emptyAgentForm,
        name: "agent",
        title: "Agent",
        baseModel: "openai",
        systemPrompt: "hello",
    };

    it("reports sync status and missing agent fields", () => {
        expect(
            getAgentSubmitDisabledReason({
                form: agent,
                syncStatus: "syncing",
            }),
        ).toBe("Waiting for agent sync to complete");
        expect(
            getAgentSubmitDisabledReason({
                form: { ...agent, name: "" },
                syncStatus: "idle",
            }),
        ).toBe("Enter an agent ID");
        expect(
            getAgentSubmitDisabledReason({
                form: { ...agent, type: "code_agent" },
                syncStatus: "idle",
            }),
        ).toBe("Enter a GitHub repository");
    });
});
