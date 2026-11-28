import { expect, it } from "vitest";
import {
    agentAttachments,
    matchesAgentFilter,
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
    ).toEqual(["Makes media", "Web search"]);
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
    ).toEqual(["Web search", "Edits video"]);
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
    ).toEqual(["Makes media", "Web search", "Runs code"]);
});

it("offers an official agent the files it declares or its tools take", () => {
    const official = { inputModalities: ["text"], verified: true };
    expect(
        agentAttachments({
            ...official,
            inputModalities: ["text", "image", "audio"],
        }),
    ).toEqual(["image", "audio"]);
    expect(
        agentAttachments({ ...official, mcpServers: ["pollinations"] }),
    ).toEqual(["audio"]);
    expect(agentAttachments({ ...official, mcpServers: ["ffmpeg"] })).toEqual([
        "audio",
        "video",
    ]);
    expect(
        agentAttachments({
            ...official,
            inputModalities: ["text", "image"],
            mcpServers: ["exa", "research"],
        }),
    ).toEqual(["image"]);
    expect(agentAttachments(official)).toEqual([]);
});

it("sends a community agent no explicit file links", () => {
    const community = {
        inputModalities: ["text", "image", "audio", "video"],
        mcpServers: ["pollinations", "ffmpeg"],
        verified: false,
    };
    expect(agentAttachments(community)).toEqual(["image"]);
    expect(takesFileLinks(community)).toBe(false);
});

it("sends file links only to official agents whose tools take them", () => {
    const official = { verified: true };
    expect(
        takesFileLinks({ ...official, mcpServers: ["exa", "pollinations"] }),
    ).toBe(true);
    expect(
        takesFileLinks({ ...official, mcpServers: ["exa", "research"] }),
    ).toBe(false);
    expect(takesFileLinks(official)).toBe(false);
});

it("filters agents by what their tools and inputs let them do", () => {
    const floret = {
        ...base,
        category: "text",
        agent: true,
        inputModalities: ["text", "image"],
        mcpServers: ["pollinations", "exa", "ffmpeg"],
    };
    const coder = {
        ...base,
        category: "text",
        agent: true,
        mcpServers: ["machines"],
    };
    const matching = (model: typeof floret | typeof coder) =>
        [
            "Makes media",
            "Takes images",
            "Web search",
            "Edits video",
            "Runs code",
        ].filter((filter) => matchesAgentFilter(model, filter));
    expect(matching(floret)).toEqual([
        "Makes media",
        "Takes images",
        "Web search",
        "Edits video",
    ]);
    expect(matching(coder)).toEqual(["Runs code"]);
});
