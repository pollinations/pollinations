import {
    AudioIcon,
    GlobeIcon,
    ImageIcon,
    LayersIcon,
    SparklesIcon,
    SpeakerIcon,
    TerminalIcon,
    ToolIcon,
    VideoIcon,
} from "@pollinations/ui";
import type { McpServerId } from "../../../../shared/registry/mcp";

type AbilityModel = {
    category: string;
    agent: boolean;
    inputModalities: string[];
    capabilities: string[];
    videoCapabilities: readonly string[];
    /** The tool servers a hosted agent can call, from the catalog. */
    mcpServers?: string[];
};

type Ability = {
    label: string;
    Icon: typeof ImageIcon;
    /** The upload tiles already say it, so the row under the picker leaves it out. */
    shownByUploads?: true;
    applies: (model: AbilityModel) => boolean;
};

const video = (model: AbilityModel, capability: string) =>
    model.category === "video" && model.videoCapabilities.includes(capability);

/**
 * What a model or agent can do beyond the basics of its tab, read from the
 * catalog. Signals almost every model has (tool calling, reasoning) stay out,
 * and so do inputs, which the upload tiles already show.
 */
const ABILITIES: Ability[] = [
    {
        label: "Makes media",
        Icon: SparklesIcon,
        applies: (model) =>
            model.agent && model.capabilities.includes("pollinations_models"),
    },
    {
        label: "Web search",
        Icon: GlobeIcon,
        applies: (model) => model.capabilities.includes("web_search"),
    },
    {
        label: "Runs code",
        Icon: TerminalIcon,
        applies: (model) => model.capabilities.includes("code_execution"),
    },
    {
        label: "With sound",
        Icon: SpeakerIcon,
        applies: (model) => video(model, "audio_output"),
    },
    {
        label: "Start and end frames",
        Icon: ImageIcon,
        applies: (model) =>
            video(model, "start_frame") && video(model, "end_frame"),
    },
    {
        label: "Start frame",
        Icon: ImageIcon,
        applies: (model) =>
            video(model, "start_frame") && !video(model, "end_frame"),
    },
    {
        label: "Reference images",
        Icon: LayersIcon,
        applies: (model) => video(model, "reference_images"),
    },
    {
        label: "Reference video",
        Icon: VideoIcon,
        applies: (model) => video(model, "reference_videos"),
    },
    {
        label: "Reference audio",
        Icon: AudioIcon,
        applies: (model) => video(model, "reference_audios"),
    },
];

// What each tool server lets an agent do, in a few broad kinds: several
// servers share a label, and the row shows each label once. Typed against the
// registry, so a new server fails the build until it has a kind here.
const WEB_SEARCH = { label: "Web search", Icon: GlobeIcon };
const RUNS_CODE = { label: "Runs code", Icon: TerminalIcon };
const OTHER_TOOLS = { label: "Other tools", Icon: ToolIcon };
const MCP_SERVER_ABILITIES: Record<
    Exclude<McpServerId, "composio">,
    Pick<Ability, "label" | "Icon" | "shownByUploads">
> = {
    pollinations: { label: "Makes media", Icon: SparklesIcon },
    exa: WEB_SEARCH,
    research: WEB_SEARCH,
    news: WEB_SEARCH,
    ffmpeg: { label: "Edits video", Icon: VideoIcon, shownByUploads: true },
    computer: RUNS_CODE,
    machines: RUNS_CODE,
    packages: OTHER_TOOLS,
    network: OTHER_TOOLS,
    calculators: OTHER_TOOLS,
    "ask-jev": OTHER_TOOLS,
};

export function modelAbilities(model: AbilityModel) {
    const servers = Object.entries(MCP_SERVER_ABILITIES)
        .filter(([id]) => model.mcpServers?.includes(id))
        .map(([, ability]) => ability);
    const all = [
        ...ABILITIES.filter((ability) => ability.applies(model)),
        ...servers,
    ];
    // A server and a catalog capability can name the same thing (exa, web_search).
    return all.filter(
        (ability, index) =>
            all.findIndex((other) => other.label === ability.label) === index,
    );
}

/** Agent picker filters: the ability labels, plus "Takes images", which reads
 * the inputs instead (the row leaves inputs out). */
export const agentFilters = [
    "Makes media",
    "Takes images",
    "Web search",
    "Edits video",
    "Runs code",
];

export function matchesAgentFilter(model: AbilityModel, filter: string) {
    if (filter === "Takes images")
        return model.inputModalities.includes("image");
    return modelAbilities(model).some((ability) => ability.label === filter);
}

type Attachment = "image" | "audio" | "video";

// The tool servers that take links to audio or video, and which kinds they take.
const MCP_SERVER_ATTACHMENTS: Record<string, Attachment[]> = {
    pollinations: ["audio"],
    ffmpeg: ["audio", "video"],
};

type AttachmentModel = Pick<AbilityModel, "inputModalities" | "mcpServers"> & {
    /** Published by an official Pollinations account. */
    verified: boolean;
};

/**
 * Whether Play also sends an agent each attachment's link as a file, for its
 * tools. Only official agents get one: a link lets whoever runs the agent open
 * the file. An attached image still carries its URL inside the image part.
 */
export function takesFileLinks(
    model: Pick<AttachmentModel, "mcpServers" | "verified">,
) {
    return (
        model.verified &&
        (model.mcpServers ?? []).some((id) => id in MCP_SERVER_ATTACHMENTS)
    );
}

/**
 * The kinds of file a hosted agent accepts: declared, or taken by its tools.
 * Audio and video reach an agent only as a link, so only official agents take
 * them.
 */
export function agentAttachments(model: AttachmentModel): Attachment[] {
    const byTool = (model.mcpServers ?? []).flatMap(
        (id) => MCP_SERVER_ATTACHMENTS[id] ?? [],
    );
    return (["image", "audio", "video"] as const).filter(
        (kind) =>
            (kind === "image" || model.verified) &&
            (model.inputModalities.includes(kind) || byTool.includes(kind)),
    );
}
