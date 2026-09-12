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
import {
    type DisplayCapability,
    getModelBrandLogoPath,
    type InputModality,
} from "./model-info.ts";
import type { ModelPrice, PriceKind } from "./types.ts";

type Icon = FC<IconProps>;

export const ModelBrandIcon: FC<{
    model: ModelPrice;
    className?: string;
}> = ({ model, className = "h-8 w-8 bg-current opacity-55 text-ink-900" }) => {
    const logoPath = getModelBrandLogoPath(model);
    const CommunityModelIcon = getCommunityModelIcon(model);

    if (model.community && logoPath) {
        return (
            <span className="relative inline-grid">
                {CommunityModelIcon && (
                    <CommunityModelIcon
                        aria-hidden="true"
                        className={`${className} col-start-1 row-start-1`}
                    />
                )}
                <span
                    aria-hidden="true"
                    className={`${className} col-start-1 row-start-1`}
                    style={{
                        maskImage: `url(${logoPath})`,
                        WebkitMaskImage: `url(${logoPath})`,
                        maskRepeat: "no-repeat",
                        WebkitMaskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskPosition: "center",
                        maskSize: "contain",
                        WebkitMaskSize: "contain",
                    }}
                />
            </span>
        );
    }

    if (logoPath) {
        return (
            <span
                aria-hidden="true"
                className={className}
                style={{
                    maskImage: `url(${logoPath})`,
                    WebkitMaskImage: `url(${logoPath})`,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskPosition: "center",
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                }}
            />
        );
    }
    return CommunityModelIcon ? (
        <CommunityModelIcon aria-hidden="true" className={className} />
    ) : null;
};

/** Community listings use their model type until a publisher logo is selected. */
export const getCommunityModelIcon = (
    model: Pick<ModelPrice, "agent" | "community" | "type">,
): Icon | undefined => {
    if (!model.community) return undefined;
    if (model.agent) return BotIcon;
    if (model.type === "image") return ImageIcon;
    if (model.type === "text") return ChatIcon;
    if (model.type === "video") return VideoIcon;
    if (model.type === "audio" || model.type === "realtime") return SpeakerIcon;
    if (model.type === "3d") return CubeIcon;
    if (model.type === "embedding") return DatabaseIcon;
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
