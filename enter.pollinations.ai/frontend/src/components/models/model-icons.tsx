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
    VideoIcon,
} from "@pollinations/ui";
import type { FC } from "react";
import type { DisplayCapability, InputModality } from "./model-info.ts";
import type { ModelPrice, PriceKind } from "./types.ts";

type Icon = FC<IconProps>;

/** Community listings use their model type instead of a provider logo. */
export const getCommunityModelIcon = (
    model: Pick<ModelPrice, "agent" | "community" | "type">,
): Icon | undefined => {
    if (!model.community) return undefined;
    if (model.agent) return BotIcon;
    if (model.type === "image") return ImageIcon;
    if (model.type === "text") return ChatIcon;
    return undefined;
};

/** Input-modality glyphs (chat/eye/video/mic). */
export const MODALITY_ICON: Record<InputModality, Icon> = {
    text: ChatIcon,
    image: EyeIcon,
    video: VideoIcon,
    audio: MicIcon,
};

/** Capability glyphs (reasoning/web search/code execution). */
export const CAPABILITY_ICON: Record<DisplayCapability, Icon> = {
    reasoning: ReasoningIcon,
    web_search: SearchIcon,
    code_execution: CodeIcon,
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
