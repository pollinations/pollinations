import type { FC } from "react";
import { isCommunityProviderIconUrl } from "../../../../../shared/community-provider-icon.ts";
import {
    BotIcon,
    ChatIcon,
    CubeIcon,
    DatabaseIcon,
    ImageIcon,
    SpeakerIcon,
    VideoIcon,
} from "../../primitives/icons/index.tsx";
import { LogoMask, organizationLogo } from "./OrganizationIcon.tsx";

/** Accepts a catalog entry or Enter's normalized model. */
type BrandModel = {
    publisher?: string;
    community?: boolean;
    agent?: boolean;
    category?: string;
    brand_icon_url?: string;
    type?: string;
    brandIconUrl?: string;
};

export function getModelBrandLogoPath(model: BrandModel): string | undefined {
    if (model.community) {
        const url = model.brand_icon_url ?? model.brandIconUrl;
        return isCommunityProviderIconUrl(url) ? url : undefined;
    }
    return organizationLogo(model.publisher);
}

export const ModelBrandIcon: FC<{
    model: BrandModel;
    className?: string;
}> = ({ model, className = "polli:size-8" }) => {
    const logoPath = getModelBrandLogoPath(model);
    if (logoPath) return <LogoMask src={logoPath} className={className} />;
    const CommunityModelIcon = getCommunityModelIcon(model);
    return CommunityModelIcon ? (
        <CommunityModelIcon aria-hidden="true" className={className} />
    ) : null;
};

/** Community listings use their model type until a publisher logo is selected. */
export const getCommunityModelIcon = (model: BrandModel) => {
    if (!model.community) return undefined;
    if (model.agent) return BotIcon;
    const type = model.category ?? model.type;
    if (type === "image") return ImageIcon;
    if (type === "text") return ChatIcon;
    if (type === "video") return VideoIcon;
    if (type === "audio" || type === "realtime") return SpeakerIcon;
    if (type === "3d") return CubeIcon;
    if (type === "embedding") return DatabaseIcon;
    return undefined;
};
