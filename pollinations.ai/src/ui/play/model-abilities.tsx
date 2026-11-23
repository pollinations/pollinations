import {
    AudioIcon,
    BookIcon,
    CubeIcon,
    DatabaseIcon,
    GitBranchIcon,
    GlobeIcon,
    ImageIcon,
    LayersIcon,
    NewspaperIcon,
    PulseIcon,
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
    applies: (model: AbilityModel) => boolean;
};

const video = (model: AbilityModel, capability: string) =>
    model.category === "video" && model.videoCapabilities.includes(capability);

/**
 * What a model or agent can do beyond the basics of its tab, read from the
 * catalog. Signals almost every model has (tool calling, reasoning) stay out.
 */
const ABILITIES: Ability[] = [
    {
        label: "Takes images",
        Icon: ImageIcon,
        applies: (model) =>
            (model.agent || model.category === "image") &&
            model.inputModalities.includes("image"),
    },
    {
        label: "Makes images, audio and video",
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

// One chip per tool server an agent may use. Typed against the registry, so a
// new server fails the build until it has a label and icon here.
const MCP_SERVER_ABILITIES: Record<
    Exclude<McpServerId, "composio">,
    Pick<Ability, "label" | "Icon">
> = {
    pollinations: {
        label: "Makes images, audio and video",
        Icon: SparklesIcon,
    },
    exa: { label: "Web search", Icon: GlobeIcon },
    ffmpeg: { label: "Edits audio and video", Icon: VideoIcon },
    computer: { label: "Own computer", Icon: TerminalIcon },
    machines: { label: "Runs code in sandboxes", Icon: CubeIcon },
    research: { label: "Research sources", Icon: BookIcon },
    news: { label: "News and feeds", Icon: NewspaperIcon },
    packages: { label: "Package lookups", Icon: DatabaseIcon },
    network: { label: "Network checks", Icon: PulseIcon },
    calculators: { label: "Calculators", Icon: ToolIcon },
    "ask-jev": { label: "Decisions", Icon: GitBranchIcon },
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
 * Whether an agent should get each attachment's link for its tools. Only
 * official agents do: a link lets whoever runs the agent open the file.
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
