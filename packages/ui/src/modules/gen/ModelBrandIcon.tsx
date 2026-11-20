import type { FC } from "react";
import { isCommunityProviderIconUrl } from "../../../../../shared/community-provider-icon.ts";
import logoAceStep from "../../brand/publishers/ace-step.svg";
import logoAlibaba from "../../brand/publishers/alibaba.svg";
import logoAmazon from "../../brand/publishers/amazon.svg";
import logoAnthropic from "../../brand/publishers/anthropic.svg";
import logoAssemblyai from "../../brand/publishers/assemblyai.svg";
import logoBlackForestLabs from "../../brand/publishers/black-forest-labs.svg";
import logoBytedance from "../../brand/publishers/bytedance.svg";
import logoCohere from "../../brand/publishers/cohere.svg";
import logoDeemos from "../../brand/publishers/deemos.svg";
import logoDeepseek from "../../brand/publishers/deepseek.svg";
import logoE2b from "../../brand/publishers/e2b.svg";
import logoElevenlabs from "../../brand/publishers/elevenlabs.svg";
import logoFishAudio from "../../brand/publishers/fish-audio.svg";
import logoGoogle from "../../brand/publishers/google.svg";
import logoHexgrad from "../../brand/publishers/hexgrad.svg";
import logoHeygen from "../../brand/publishers/heygen.svg";
import logoHotshot from "../../brand/publishers/hotshot.svg";
import logoIdeogram from "../../brand/publishers/ideogram.svg";
import logoInception from "../../brand/publishers/inception.svg";
import logoInclusionai from "../../brand/publishers/inclusionai.svg";
import logoInferenceport from "../../brand/publishers/inferenceport.svg";
import logoJaredPalmer from "../../brand/publishers/jared-palmer.svg";
import logoKandinsky from "../../brand/publishers/kandinsky.svg";
import logoKling from "../../brand/publishers/kling.svg";
import logoKrea from "../../brand/publishers/krea.svg";
import logoLightricks from "../../brand/publishers/lightricks.svg";
import logoLiquidAi from "../../brand/publishers/liquid-ai.svg";
import logoLykon from "../../brand/publishers/lykon.svg";
import logoMeituan from "../../brand/publishers/meituan.svg";
import logoMeta from "../../brand/publishers/meta.svg";
import logoMicrosoft from "../../brand/publishers/microsoft.svg";
import logoMinimax from "../../brand/publishers/minimax.svg";
import logoMirelo from "../../brand/publishers/mirelo.svg";
import logoMistral from "../../brand/publishers/mistral.svg";
import logoMoonshot from "../../brand/publishers/moonshot.svg";
import logoNexAgi from "../../brand/publishers/nex-agi.svg";
import logoNvidia from "../../brand/publishers/nvidia.svg";
import logoOpenai from "../../brand/publishers/openai.svg";
import logoPerplexity from "../../brand/publishers/perplexity.svg";
import logoPollinations from "../../brand/publishers/pollinations.svg";
import logoPoolside from "../../brand/publishers/poolside.svg";
import logoPruna from "../../brand/publishers/pruna.svg";
import logoQuiverai from "../../brand/publishers/quiverai.svg";
import logoQwen from "../../brand/publishers/qwen.svg";
import logoRecraft from "../../brand/publishers/recraft.svg";
import logoRespan from "../../brand/publishers/respan.svg";
import logoSesame from "../../brand/publishers/sesame.svg";
import logoSonilo from "../../brand/publishers/sonilo.svg";
import logoStability from "../../brand/publishers/stability.svg";
import logoStealth from "../../brand/publishers/stealth.svg";
import logoStepfun from "../../brand/publishers/stepfun.svg";
import logoTencent from "../../brand/publishers/tencent.svg";
import logoThinkingMachines from "../../brand/publishers/thinking-machines.svg";
import logoTripo from "../../brand/publishers/tripo.svg";
import logoTypesafe from "../../brand/publishers/typesafe.svg";
import logoVllmSr from "../../brand/publishers/vllm-sr.svg";
import logoXai from "../../brand/publishers/xai.svg";
import logoXiaomi from "../../brand/publishers/xiaomi.svg";
import logoZai from "../../brand/publishers/zai.svg";
import logoZyphra from "../../brand/publishers/zyphra.svg";
import {
    BotIcon,
    ChatIcon,
    CubeIcon,
    DatabaseIcon,
    ImageIcon,
    SpeakerIcon,
    VideoIcon,
} from "../../primitives/icons/index.tsx";

const BRAND_LOGOS: Record<string, string> = {
    "ACE-Step": logoAceStep,
    E2B: logoE2b,
    Alibaba: logoAlibaba,
    Amazon: logoAmazon,
    Anthropic: logoAnthropic,
    AssemblyAI: logoAssemblyai,
    "Black Forest Labs": logoBlackForestLabs,
    ByteDance: logoBytedance,
    Cohere: logoCohere,
    Deemos: logoDeemos,
    DeepSeek: logoDeepseek,
    ElevenLabs: logoElevenlabs,
    "Fish Audio": logoFishAudio,
    Google: logoGoogle,
    Hexgrad: logoHexgrad,
    HeyGen: logoHeygen,
    Hotshot: logoHotshot,
    Hyper3D: logoDeemos,
    Ideogram: logoIdeogram,
    Inception: logoInception,
    InferencePort: logoInferenceport,
    inclusionAI: logoInclusionai,
    "Jared Palmer": logoJaredPalmer,
    "Kandinsky Lab": logoKandinsky,
    Krea: logoKrea,
    Kuaishou: logoKling,
    Lightricks: logoLightricks,
    "Liquid AI": logoLiquidAi,
    "Mirelo AI": logoMirelo,
    Lykon: logoLykon,
    Meituan: logoMeituan,
    Meta: logoMeta,
    Microsoft: logoMicrosoft,
    MiniMax: logoMinimax,
    Mistral: logoMistral,
    "Moonshot AI": logoMoonshot,
    "Nex AGI": logoNexAgi,
    NVIDIA: logoNvidia,
    OpenAI: logoOpenai,
    Perplexity: logoPerplexity,
    Pollinations: logoPollinations,
    Poolside: logoPoolside,
    Pruna: logoPruna,
    Qwen: logoQwen,
    QuiverAI: logoQuiverai,
    Recraft: logoRecraft,
    Respan: logoRespan,
    Sesame: logoSesame,
    Sonilo: logoSonilo,
    Stealth: logoStealth,
    "Stability AI": logoStability,
    StepFun: logoStepfun,
    Tencent: logoTencent,
    "Thinking Machines": logoThinkingMachines,
    Tripo: logoTripo,
    TypeSafe: logoTypesafe,
    "vLLM Semantic Router": logoVllmSr,
    Xiaomi: logoXiaomi,
    "Z.ai": logoZai,
    Zyphra: logoZyphra,
    xAI: logoXai,
};

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
    const { publisher } = model;
    return publisher && Object.hasOwn(BRAND_LOGOS, publisher)
        ? BRAND_LOGOS[publisher]
        : undefined;
}

export const ModelBrandIcon: FC<{
    model: BrandModel;
    className?: string;
}> = ({ model, className = "polli:size-8" }) => {
    const logoPath = getModelBrandLogoPath(model);
    if (logoPath) {
        const mask = `url(${JSON.stringify(logoPath)}) center / contain no-repeat`;
        return (
            <span
                aria-hidden="true"
                className={`polli:inline-block polli:bg-current ${className}`}
                style={{
                    mask,
                    WebkitMask: mask,
                }}
            />
        );
    }
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
