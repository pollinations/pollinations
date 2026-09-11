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
import { type FC, useState } from "react";
import {
    type DisplayCapability,
    getModelBrandLogoPath,
    type InputModality,
    isSafeCommunityProviderIconUrl,
} from "./model-info.ts";
import type { ModelPrice, PriceKind } from "./types.ts";

type Icon = FC<IconProps>;

export const ModelBrandIcon: FC<{
    model: ModelPrice;
    className?: string;
}> = ({ model, className = "h-8 w-8 bg-current opacity-55 text-ink-900" }) => {
    const primaryPath = getModelBrandLogoPath(model);
    const fallbackPath =
        model.community && isSafeCommunityProviderIconUrl(model.brandIconUrl)
            ? getModelBrandLogoPath({ ...model, brandIconUrl: undefined })
            : undefined;
    const logoCandidates = [primaryPath, fallbackPath].filter(
        (path, index, paths): path is string =>
            Boolean(path) && paths.indexOf(path) === index,
    );
    const candidateKey = logoCandidates.join("|");
    const [failedState, setFailedState] = useState<{
        key: string;
        paths: Set<string>;
    }>({ key: "", paths: new Set() });
    const failedPaths =
        failedState.key === candidateKey
            ? failedState.paths
            : new Set<string>();
    const logoPath = logoCandidates.find((path) => !failedPaths.has(path));
    const CommunityModelIcon = getCommunityModelIcon(model);

    if (!logoPath) {
        return CommunityModelIcon ? (
            <CommunityModelIcon aria-hidden="true" className={className} />
        ) : null;
    }
    return (
        <>
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
            {logoCandidates.map((path) => (
                <img
                    key={path}
                    src={path}
                    alt=""
                    className="hidden"
                    onError={() =>
                        setFailedState((current) => {
                            const paths =
                                current.key === candidateKey
                                    ? new Set(current.paths)
                                    : new Set<string>();
                            paths.add(path);
                            return { key: candidateKey, paths };
                        })
                    }
                />
            ))}
        </>
    );
};

/** Community listings use their model type until a publisher logo is selected. */
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
