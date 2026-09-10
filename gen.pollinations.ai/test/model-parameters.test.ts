import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import {
    BASE_CHAT_PARAMETERS,
    getModelChatParameters,
} from "@shared/registry/model-parameters.ts";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";

describe("getModelChatParameters", () => {
    it("strips sampling knobs the Azure route drops on GPT-5.4 Nano", () => {
        const profile = getModelChatParameters("openai/gpt-5.4-nano");
        expect(profile).not.toBeNull();
        for (const stripped of [
            "temperature",
            "top_p",
            "frequency_penalty",
            "presence_penalty",
            "repetition_penalty",
            "seed",
        ]) {
            expect(profile?.supported).not.toContain(stripped);
        }
        expect(profile?.supported).toContain("reasoning_effort");
        expect(profile?.supported).toContain("tools");
    });

    it("keeps the full surface on DeepSeek V4 Flash", () => {
        const profile = getModelChatParameters("deepseek/deepseek-v4-flash");
        expect(profile?.supported).toContain("temperature");
        expect(profile?.supported).toContain("reasoning_effort");
        expect(profile?.supported).toHaveLength(BASE_CHAT_PARAMETERS.length);
    });

    it("strips only temperature/top_p on Claude Sonnet 4.6", () => {
        const profile = getModelChatParameters("anthropic/claude-sonnet-4.6");
        expect(profile?.supported).not.toContain("temperature");
        expect(profile?.supported).not.toContain("top_p");
        // Mapped to a thinking budget upstream, still honored.
        expect(profile?.supported).toContain("reasoning_effort");
        expect(profile?.supported).toContain("tools");
    });

    it("returns null for unverified models instead of guessing", () => {
        expect(getModelChatParameters("mistralai/mistral-small-4")).toBeNull();
    });

    it("resolves public aliases to the same profile", () => {
        expect(resolveModelName("openai")).toBe("openai/gpt-5.4-nano");
        expect(resolveModelName("deepseek")).toBe("deepseek/deepseek-v4-flash");
        expect(resolveModelName("claude")).toBe("anthropic/claude-sonnet-4.6");
        for (const alias of ["openai", "deepseek", "claude"]) {
            const canonical = resolveModelName(alias);
            expect(getModelChatParameters(canonical)).not.toBeNull();
        }
    });

    it("only defaults controls the model supports", () => {
        for (const id of [
            "openai/gpt-5.4-nano",
            "deepseek/deepseek-v4-flash",
            "anthropic/claude-sonnet-4.6",
        ]) {
            const profile = getModelChatParameters(id);
            expect(profile).not.toBeNull();
            for (const key of Object.keys(profile?.defaults ?? {})) {
                expect(profile?.supported).toContain(key);
            }
        }
    });
});

describe("modelInfoFromDefinition parameter threading", () => {
    it("exposes verified parameters on listings", () => {
        const info = modelInfoFromDefinition(
            "openai/gpt-5.4-nano",
            getRegistryModelDefinition("openai/gpt-5.4-nano"),
        );
        expect(info.supported_parameters).toContain("reasoning_effort");
        expect(info.supported_parameters).not.toContain("temperature");
        expect(info.default_parameters?.stream).toBe(false);
    });

    it("omits the fields for unverified models", () => {
        const info = modelInfoFromDefinition(
            "mistralai/mistral-small-4",
            getRegistryModelDefinition("mistralai/mistral-small-4"),
        );
        expect(info.supported_parameters).toBeUndefined();
        expect(info.default_parameters).toBeUndefined();
    });
});
