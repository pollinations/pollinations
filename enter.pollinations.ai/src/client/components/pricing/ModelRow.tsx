import { type FC, useState } from "react";
import type { ModelPrice } from "./types.ts";
import {
  hasReasoning,
  hasVision,
  hasAudioInput,
  hasSearch,
  hasCodeExecution,
  getModelDisplayName,
} from "./model-info.ts";
import { calculatePerPollen } from "./calculations.ts";
import { PriceBadge } from "./PriceBadge.tsx";
import { Tooltip } from "./Tooltip.tsx";

type ModelRowProps = {
  model: ModelPrice;
};

export const ModelRow: FC<ModelRowProps> = ({ model }) => {
  const modelDisplayName = getModelDisplayName(model.name);
  const genPerPollen = calculatePerPollen(model);
  const [copied, setCopied] = useState(false);

  const copyModelName = async () => {
    await navigator.clipboard.writeText(model.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Get model capabilities
  const showReasoning = hasReasoning(model.name);
  const showVision = hasVision(model.name);
  const showAudioInput = hasAudioInput(model.name);
  const showSearch = hasSearch(model.name);
  const showCodeExecution = hasCodeExecution(model.name);

  return (
    <tr className="border-b border-gray-200">
      <td className="py-2 px-2 text-sm text-gray-700 whitespace-nowrap relative group">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="font-medium">
              {modelDisplayName || model.name}
            </span>
            <button
              type="button"
              onClick={copyModelName}
              className="text-xs text-gray-500 font-mono hover:text-gray-700 cursor-pointer text-left"
              title="Click to copy"
            >
              {copied ? "✓ copied" : model.name}
            </button>
          </div>
          {showVision && (
            <Tooltip
              content={
                model.type === "image"
                  ? "Vision (image-to-image)"
                  : "Vision input"
              }
            >
              <span className="text-base">👁️</span>
            </Tooltip>
          )}
          {showAudioInput && (
            <Tooltip content="Audio input">
              <span className="text-base">👂</span>
            </Tooltip>
          )}
          {showReasoning && (
            <Tooltip content="Reasoning">
              <span className="text-base">🧠</span>
            </Tooltip>
          )}
          {showSearch && (
            <Tooltip content="Web search">
              <span className="text-base">🔍</span>
            </Tooltip>
          )}
          {showCodeExecution && (
            <Tooltip content="Code execution">
              <span className="text-base">💻</span>
            </Tooltip>
          )}
        </div>
      </td>
      <td className="py-2 px-2 text-sm">
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-yellow-100 to-orange-100 text-orange-900 border border-orange-200 ${model.type === "image" ? "uppercase" : ""}`}
          >
            {genPerPollen}
          </span>
        </div>
      </td>
      <td className="py-2 px-2 text-sm text-center">
        {genPerPollen === "—" ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1 justify-center">
            <PriceBadge
              prices={[model.promptTextPrice, model.promptCachedPrice]}
              emoji="💬"
              subEmojis={["💬", "💾"]}
              perToken={model.perToken}
            />
            <PriceBadge
              prices={[model.promptAudioPrice]}
              emoji="🔊"
              subEmojis={["🔊"]}
              perToken={model.perToken}
            />
            <PriceBadge
              prices={[model.promptImagePrice]}
              emoji="🖼️"
              subEmojis={["🖼️"]}
              perToken={model.perToken}
            />
          </div>
        )}
      </td>
      <td className="py-2 px-2 text-sm text-center">
        {genPerPollen === "—" ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1 justify-center">
            <PriceBadge
              prices={[model.completionTextPrice]}
              emoji="💬"
              subEmojis={["💬"]}
              perToken={model.perToken}
            />
            <PriceBadge
              prices={[model.completionAudioPrice]}
              emoji="🔊"
              subEmojis={["🔊"]}
              perToken={model.perToken}
            />
            {model.perSecondPrice ? (
              <PriceBadge
                prices={[model.perSecondPrice]}
                emoji="🎬"
                subEmojis={["🎬"]}
                perSecond
              />
            ) : model.perTokenPrice ? (
              <PriceBadge
                prices={[model.perTokenPrice]}
                emoji="🎬"
                subEmojis={["🎬"]}
                perToken
              />
            ) : model.perImagePrice ? (
              <PriceBadge
                prices={[model.perImagePrice]}
                emoji="🖼️"
                subEmojis={["🖼️"]}
                perImage
              />
            ) : (
              <PriceBadge
                prices={[model.completionImagePrice]}
                emoji="🖼️"
                subEmojis={["🖼️"]}
                perToken={model.perToken}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
};
