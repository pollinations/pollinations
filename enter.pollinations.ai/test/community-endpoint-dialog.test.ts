import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
    AgentDialog,
    getAgentSubmitDisabledReason,
} from "../frontend/src/components/community-endpoints/agent-dialog.tsx";
import {
    CommunityEndpointDialog,
    getCommunityEndpointSubmitDisabledReason,
} from "../frontend/src/components/community-endpoints/community-endpoint-dialog.tsx";
import {
    type ActionState,
    type EditableEndpoint,
    type EndpointFormState,
    emptyForm,
} from "../frontend/src/components/community-endpoints/types.ts";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("getCommunityEndpointSubmitDisabledReason", () => {
    const idleState: ActionState = { status: "idle" };

    const validForm: EndpointFormState = {
        ...emptyForm,
        name: "my-model",
        title: "My Model",
        url: "https://api.example.com/v1",
        bearerToken: "sk-test",
    };

    it("identifies missing model identity fields", () => {
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, name: "" },
                isEdit: false,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter a model ID");

        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, name: "" },
                isEdit: false,
                isEndpointAgent: true,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter an agent ID");

        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, title: "   " },
                isEdit: false,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter a title");

        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, url: "" },
                isEdit: false,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter an endpoint URL");

        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, url: "", modality: "video" },
                isEdit: false,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter a video endpoint URL");
    });

    it("identifies missing token for new endpoints", () => {
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, bearerToken: "" },
                isEdit: false,
                isEndpointAgent: false,
                hasToken: false,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter an API bearer token");
    });

    it("identifies publishing requirements when switching a model to public", () => {
        // Editing a model: token is not prefilled for security, switching to public requires re-entering token and testing
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: { ...validForm, bearerToken: "" },
                isEdit: true,
                isEndpointAgent: false,
                hasToken: false,
                needsTest: true,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe(
            "Re-enter your API bearer token and test the endpoint before publishing",
        );

        // Token is entered, but test has not been executed yet
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: true,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Test the endpoint before publishing");

        // Test is currently in flight
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: true,
                testState: { status: "loading", message: "Testing..." },
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Waiting for endpoint test to complete");

        // Test failed
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: true,
                testState: { status: "error", message: "Connection refused" },
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe(
            "Endpoint test failed. Fix errors and test again before publishing",
        );
    });

    it("identifies pricing and RPM validation issues", () => {
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: false,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Enter valid pricing values (or leave blank for free)");

        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: false,
            }),
        ).toBe("Enter a valid per-user RPM limit");
    });

    it("returns fallback message if unknown fields fail or null when all valid", () => {
        expect(
            getCommunityEndpointSubmitDisabledReason({
                form: validForm,
                isEdit: true,
                isEndpointAgent: false,
                hasToken: true,
                needsTest: false,
                testState: idleState,
                testRequirementMet: false,
                hasValidVisiblePrices: true,
                hasValidPerUserRpm: true,
            }),
        ).toBe("Complete all required fields to save");
    });
});

describe("getAgentSubmitDisabledReason", () => {
    it("reports sync status and missing agent fields", () => {
        expect(
            getAgentSubmitDisabledReason({
                form: {
                    name: "agent",
                    title: "Agent",
                    description: "",
                    visibility: "private",
                    type: "prompt_agent",
                    baseModel: "openai",
                    systemPrompt: "hello",
                    repository: "",
                    requiredSafetyFeatures: [],
                },
                syncStatus: "syncing",
            }),
        ).toBe("Waiting for agent sync to complete");

        expect(
            getAgentSubmitDisabledReason({
                form: {
                    name: "",
                    title: "Agent",
                    description: "",
                    visibility: "private",
                    type: "prompt_agent",
                    baseModel: "openai",
                    systemPrompt: "hello",
                    repository: "",
                    requiredSafetyFeatures: [],
                },
                syncStatus: "idle",
            }),
        ).toBe("Enter an agent ID");

        expect(
            getAgentSubmitDisabledReason({
                form: {
                    name: "agent",
                    title: "Agent",
                    description: "",
                    visibility: "private",
                    type: "code_agent",
                    baseModel: "",
                    systemPrompt: "",
                    repository: "",
                    requiredSafetyFeatures: [],
                },
                syncStatus: "idle",
            }),
        ).toBe("Enter a GitHub repository");
    });
});

describe("CommunityEndpointDialog rendering", () => {
    const validEndpoint: EditableEndpoint = {
        id: "model-1",
        modelId: "community/user/model-1",
        name: "model-1",
        title: "Model 1",
        description: null,
        visibility: "private",
        type: "proxy",
        modality: "text",
        api: "chat_completions",
        url: "https://api.example.com/v1",
        upstreamModel: "gpt-4",
        paidOnly: false,
        imagePricing: "request",
        perUserRpm: null,
        fallbacks: [],
        requiredSafetyFeatures: [],
        inputModalities: ["text"],
        advertised: {
            capabilities: [],
            contextLength: 4096,
        },
        pricing: {
            promptTextPrice: null,
            promptAudioPrice: null,
            promptImagePrice: null,
            completionTextPrice: null,
            completionAudioPrice: null,
            completionImagePrice: null,
            completionVideoPrice: null,
        },
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
    };

    it("renders an enabled submit button without tooltip when editing a valid private endpoint", () => {
        const html = renderToStaticMarkup(
            createElement(CommunityEndpointDialog, {
                endpoint: validEndpoint,
                canPublish: true,
                fallbackOptions: [],
                open: true,
                onOpenChange: () => {},
                onSubmit: async () => {},
            }),
        );

        // When opened with valid private model, button is enabled
        const submitButton = html.match(
            /<button\b(?:(?!<\/button>).)*Save changes<\/button>/,
        )?.[0];
        expect(submitButton).toBeDefined();
        expect(submitButton).toContain('type="submit"');
        expect(submitButton).not.toMatch(/\bdisabled\b(?!:)/);
        // No disabled tooltip wrapper around the submit button
        expect(html).not.toContain('aria-label="Enter');
        expect(html).not.toContain('aria-label="Complete');
        expect(html).not.toContain('aria-label="Re-enter');
    });

    it("renders an accessible tooltip and disabled submit button when creating a new endpoint", () => {
        const html = renderToStaticMarkup(
            createElement(CommunityEndpointDialog, {
                endpoint: undefined,
                canPublish: true,
                fallbackOptions: [],
                open: true,
                onOpenChange: () => {},
                onSubmit: async () => {},
            }),
        );

        // Submit button is disabled
        const submitButton = html.match(
            /<button\b(?:(?!<\/button>).)*Create model<\/button>/,
        )?.[0];
        expect(submitButton).toBeDefined();
        expect(submitButton).toContain('type="submit"');
        expect(submitButton).toMatch(/\bdisabled\b(?!:)/);

        // Keyboard accessible tab stop and tooltip trigger
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('role="button"');
        expect(html).toContain('aria-label="Enter a model ID"');
        expect(html).toContain('role="tooltip"');
        expect(html).toContain("Enter a model ID");
    });

    it("renders an accessible tooltip and disabled submit button when editing an endpoint with invalid title", () => {
        const html = renderToStaticMarkup(
            createElement(CommunityEndpointDialog, {
                endpoint: { ...validEndpoint, title: "   " },
                canPublish: true,
                fallbackOptions: [],
                open: true,
                onOpenChange: () => {},
                onSubmit: async () => {},
            }),
        );

        // Submit button is disabled
        const submitButton = html.match(
            /<button\b(?:(?!<\/button>).)*Save changes<\/button>/,
        )?.[0];
        expect(submitButton).toBeDefined();
        expect(submitButton).toContain('type="submit"');
        expect(submitButton).toMatch(/\bdisabled\b(?!:)/);

        // Keyboard accessible tab stop and tooltip trigger
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('role="button"');
        expect(html).toContain('aria-label="Enter a title"');
        expect(html).toContain('role="tooltip"');
        expect(html).toContain("Enter a title");
    });
});

describe("AgentDialog rendering", () => {
    it("renders an accessible tooltip on disabled submit button when required agent fields are missing", () => {
        const html = renderToStaticMarkup(
            createElement(AgentDialog, {
                agent: undefined,
                canPublish: true,
                open: true,
                onOpenChange: () => {},
                onSubmit: async () => {},
            }),
        );

        // Submit button is disabled
        const submitButton = html.match(
            /<button\b(?:(?!<\/button>).)*Create agent<\/button>/,
        )?.[0];
        expect(submitButton).toBeDefined();
        expect(submitButton).toContain('type="submit"');
        expect(submitButton).toMatch(/\bdisabled\b(?!:)/);

        // Keyboard accessible tab stop and tooltip trigger
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('role="button"');
        expect(html).toContain('aria-label="Enter an agent ID"');
        expect(html).toContain('role="tooltip"');
        expect(html).toContain("Enter an agent ID");
    });
});
