import type { FC } from "react";
import type { ModelPrice } from "./types.ts";
import { hasReasoning, hasVision, hasAudioInput, getModelDescription, getTextModelId, getImageModelId } from "./model-info.ts";
import { calculatePerPollen } from "./calculations.ts";
import { PriceBadge } from "./PriceBadge.tsx";

type ModelRowProps = {
    model: ModelPrice;
};

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
    const description = getModelDescription(model.name, model.type);
    const realModelId = model.type === "text" 
        ? getTextModelId(model.name as any) 
        : getImageModelId(model.name as any);
    const genPerPollen = calculatePerPollen(model);
    
    // Get model capabilities
    const showReasoning = hasReasoning(model.name, model.type);
    const showVision = hasVision(model.name, model.type);
    const showAudioInput = hasAudioInput(model.name, model.type);

    // Only show info icon if real modelId is different from service name
    const showModelIdInfo = realModelId && realModelId !== model.name;

    return (
        <tr className="border-b border-gray-200">
            <td className="py-2 px-2 text-sm font-mono text-gray-700 whitespace-nowrap relative group">
                <div className="flex items-center gap-2">
                    {model.name}
                    {showModelIdInfo && (
                        <span className="relative inline-flex items-center group/info">
                            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold">
                                i
                            </span>
                            <span className="invisible group-hover/info:visible absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none font-mono">
                                {realModelId}
                            </span>
                        </span>
                    )}
                    {showVision && (
                        <span className="text-base" title={model.type === "image" ? "Vision - supports image input (image-to-image)" : "Vision - supports image input"}>
                            👁️
                        </span>
                    )}
                    {showAudioInput && (
                        <span className="text-base" title="Audio input support">
                            👂
                        </span>
                    )}
                    {showReasoning && (
                        <span className="text-base" title="Advanced reasoning capabilities">
                            🧠
                        </span>
                    )}
                </div>
                {description && (
                    <span className="invisible group-hover:visible absolute left-0 top-full mt-1 px-3 py-2 bg-white text-gray-700 text-xs rounded-lg shadow-lg border border-gray-200 whitespace-nowrap z-50 pointer-events-none">
                        {description}
                    </span>
                )}
            </td>
            <td className="py-2 px-2 text-sm">
                <div className="flex justify-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-100 to-orange-100 text-orange-900 border border-orange-200 ${model.type === 'image' ? 'uppercase' : ''}`}>
                        {genPerPollen}
                    </span>
                </div>
            </td>
            <td className="py-2 px-2 text-sm text-center">
                {genPerPollen === "—" ? (
                    <span className="text-gray-400">—</span>
                ) : (
                    <div className="flex flex-wrap gap-1 justify-center">
                        <PriceBadge prices={[model.promptTextPrice, model.promptCachedPrice]} emoji="💬" subEmojis={["💬", "💾"]} perToken={model.perToken} />
                        <PriceBadge prices={[model.promptAudioPrice]} emoji="🔊" subEmojis={["🔊"]} perToken={model.perToken} />
                        <PriceBadge prices={[model.promptImagePrice]} emoji="🖼️" subEmojis={["🖼️"]} perToken={model.perToken} />
                    </div>
                )}
            </td>
            <td className="py-2 px-2 text-sm text-center">
                {genPerPollen === "—" ? (
                    <span className="text-gray-400">—</span>
                ) : (
                    <div className="flex flex-wrap gap-1 justify-center">
                        <PriceBadge prices={[model.completionTextPrice]} emoji="💬" subEmojis={["💬"]} perToken={model.perToken} />
                        <PriceBadge prices={[model.completionAudioPrice]} emoji="🔊" subEmojis={["🔊"]} perToken={model.perToken} />
                        {model.perImagePrice ? (
                            <PriceBadge prices={[model.perImagePrice]} emoji="🖼️" subEmojis={["🖼️"]} perImage />
                        ) : (
                            <PriceBadge prices={[model.completionImagePrice]} emoji="🖼️" subEmojis={["🖼️"]} perToken={model.perToken} />
                        )}
                    </div>
                )}
            </td>
        </tr>
    );
};
