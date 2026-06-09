import {
    ChatIcon,
    CodeIcon,
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
import type { InputModality, ModelCapability } from "./model-info.ts";

type Icon = FC<IconProps>;

/** Input-modality glyphs (chat/eye/video/mic). */
export const MODALITY_ICON: Record<InputModality, Icon> = {
    text: ChatIcon,
    image: EyeIcon,
    video: VideoIcon,
    audio: MicIcon,
};

/** Capability glyphs (reasoning/search/code). */
export const CAPABILITY_ICON: Record<ModelCapability, Icon> = {
    reasoning: ReasoningIcon,
    search: SearchIcon,
    code: CodeIcon,
};

/** Price-tier token kinds and their glyphs. */
export type PriceKind =
    | "text"
    | "image"
    | "cached"
    | "video"
    | "audioIn"
    | "audioOut";

export const PRICE_ICON: Record<PriceKind, Icon> = {
    text: ChatIcon,
    image: ImageIcon,
    cached: DatabaseIcon,
    video: VideoIcon,
    audioIn: MicIcon,
    audioOut: SpeakerIcon,
};
