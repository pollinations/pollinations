import {
    BotIcon,
    ChatIcon,
    CodeIcon,
    CubeIcon,
    DatabaseIcon,
    EyeIcon,
    type IconProps,
    ImageIcon,
    MicIcon,
    ReasoningIcon,
    SearchIcon,
    SpeakerIcon,
    ToolIcon,
    VideoIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import type { DisplayCapability, InputModality } from "./model-info.ts";
import type { PriceKind } from "./types.ts";

type Icon = FC<IconProps>;

export const ContextIcon = (props: IconProps) => (
    <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M4 6h16M4 12h12M4 18h8" />
    </svg>
);

/** Input-modality glyphs (chat/eye/video/mic). */
export const MODALITY_ICON: Record<InputModality, Icon> = {
    text: ChatIcon,
    image: EyeIcon,
    video: VideoIcon,
    audio: MicIcon,
};

/** Capability glyphs (reasoning/web search/code execution). */
export const CAPABILITY_ICON: Record<DisplayCapability, Icon> = {
    agent: BotIcon,
    tool_calling: ToolIcon,
    reasoning: ReasoningIcon,
    web_search: SearchIcon,
    code_execution: CodeIcon,
    pollinations_models: ToolIcon,
};

export const PRICE_ICON: Record<PriceKind, Icon> = {
    text: ChatIcon,
    image: ImageIcon,
    "3d": CubeIcon,
    cached: DatabaseIcon,
    cacheWrite: DatabaseIcon,
    reasoning: ReasoningIcon,
    video: VideoIcon,
    audioIn: MicIcon,
    audioOut: SpeakerIcon,
};
