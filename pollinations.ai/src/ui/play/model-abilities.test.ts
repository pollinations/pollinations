import { expect, it } from "vitest";
import {
    agentAttachments,
    modelAbilities,
    takesFileLinks,
} from "./model-abilities";

const labels = (model: Parameters<typeof modelAbilities>[0]) =>
    modelAbilities(model).map((ability) => ability.label);

const base = {
    agent: false,
    inputModalities: ["text"],
    capabilities: ["tool_calling", "reasoning"],
    videoCapabilities: [],
};

it("shows an agent's image input and tools, not the common signals", () => {
    expect(
        labels({
            ...base,
            category: "text",
            agent: true,
            inputModalities: ["text", "image"],
            capabilities: [
                "tool_calling",
                "reasoning",
                "pollinations_models",
                "web_search",
            ],
        }),
    ).toEqual(["Takes images", "Makes images, audio and video", "Web search"]);
    expect(labels({ ...base, category: "text", agent: true })).toEqual([]);
});

it("reads a video model's frames, sound and references", () => {
    expect(
        labels({
            ...base,
            category: "video",
            inputModalities: ["text", "image"],
            videoCapabilities: [
                "start_frame",
                "end_frame",
                "audio_output",
                "reference_videos",
            ],
        }),
    ).toEqual(["With sound", "Start and end frames", "Reference video"]);
});

it("adds one chip per tool server, without repeating a capability", () => {
    expect(
        labels({
            ...base,
            category: "text",
            agent: true,
            capabilities: ["tool_calling", "web_search"],
            mcpServers: ["exa", "ffmpeg", "research"],
        }),
    ).toEqual(["Web search", "Edits audio and video", "Research sources"]);
});

it("shows what an external agent declares for itself", () => {
    expect(
        labels({
            ...base,
            category: "text",
            agent: true,
            inputModalities: ["text", "image"],
            capabilities: [
                "pollinations_models",
                "web_search",
                "code_execution",
            ],
        }),
    ).toEqual([
        "Takes images",
        "Makes images, audio and video",
        "Web search",
        "Runs code",
    ]);
});

it("offers the files an agent declares or its tools take", () => {
    const text = ["text"];
    expect(
        agentAttachments({ inputModalities: ["text", "image", "audio"] }),
    ).toEqual(["image", "audio"]);
    expect(
        agentAttachments({
            inputModalities: text,
            mcpServers: ["pollinations"],
        }),
    ).toEqual(["audio"]);
    expect(
        agentAttachments({ inputModalities: text, mcpServers: ["ffmpeg"] }),
    ).toEqual(["audio", "video"]);
    expect(
        agentAttachments({
            inputModalities: ["text", "image"],
            mcpServers: ["exa", "research"],
        }),
    ).toEqual(["image"]);
    expect(agentAttachments({ inputModalities: text })).toEqual([]);
});

it("sends file links only to agents whose tools take them", () => {
    expect(takesFileLinks({ mcpServers: ["exa", "pollinations"] })).toBe(true);
    expect(takesFileLinks({ mcpServers: ["exa", "research"] })).toBe(false);
    expect(takesFileLinks({})).toBe(false);
});
