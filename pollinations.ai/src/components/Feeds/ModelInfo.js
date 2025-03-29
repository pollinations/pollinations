import React from 'react';
import { Box, Link } from '@mui/material';
import { Colors, Fonts } from '../../config/global';
import { useTextModels } from '../../utils/useTextModels';

/**
 * Shared ModelInfo component for both image and text feeds
 * 
 * @param {Object} props
 * @param {string} props.model - Model identifier
 * @param {string} props.referrer - Referrer URL
 * @param {string} props.itemType - Type of item ("image" or "text")
 */
export function ModelInfo({ model, referrer, itemType = "text" }) {
  // For text feeds, we get available models from the API
  const { models } = useTextModels();

  // Format referrer to show just the domain
  const formatReferrer = (url) => {
    if (!url) return "-";
    const domain = url.replace(/^https?:\/\//, "").split("/")[0];
    return domain.split(".").slice(-2).join(".");
  };

  // Get model info based on item type and model ID
  const getModelInfo = () => {
    if (itemType === "image") {
      // Image model mapping
      const IMAGE_MODELS = {
        turbo: {
          name: "Boltning",
          link: "https://civitai.com/models/413466/boltning-realistic-lightning-hyper",
        },
        flux: {
          name: "Flux.Schnell",
          link: "https://blackforestlabs.ai/",
        },
        default: {
          name: "Unknown Model",
          link: "#",
        },
      };
      
      return IMAGE_MODELS[model] || IMAGE_MODELS.default;
    } else {
      // Text model handling - first try to find in models from API
      if (models && Array.isArray(models)) {
        const foundModel = models.find(m => m.id === model);
        if (foundModel) {
          return {
            name: foundModel.name,
            link: getTextModelLink(model),
          };
        }
      }
      
      // Fallback to known text models mapping
      const knownModels = {
        'openai': { name: 'OpenAI GPT-4o-mini', link: 'https://openai.com/blog/gpt-4o-mini' },
        'openai-large': { name: 'OpenAI GPT-4o', link: 'https://openai.com/blog/gpt-4o' },
        'mistral': { name: 'Mistral Small', link: 'https://mistral.ai/news/mistral-small-31' },
        'searchgpt': { name: 'SearchGPT', link: 'https://github.com/pollinations/pollinations' },
        'deepseek': { name: 'DeepSeek V3', link: 'https://www.deepseek.com/' },
        'llama': { name: 'Llama 3.3 70B', link: 'https://ai.meta.com/llama/' },
      };
      
      if (knownModels[model]) return knownModels[model];
      
      // Final fallback - format the model ID nicely
      return {
        name: model ? model
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ') : 'Unknown Model',
        link: 'https://pollinations.ai',
      };
    }
  };

  // Helper function to get text model link
  const getTextModelLink = (modelId) => {
    const providers = {
      'openai': 'https://openai.com/blog/gpt-4o-mini',
      'openai-large': 'https://openai.com/blog/gpt-4o',
      'mistral': 'https://mistral.ai/news/mistral-small-31',
      'searchgpt': 'https://github.com/pollinations/pollinations',
      'deepseek': 'https://www.deepseek.com/',
      'llama': 'https://ai.meta.com/llama/',
    };
    
    return providers[modelId] || 'https://pollinations.ai';
  };

  // Get appropriate prompt enhancer link based on item type
  const getPromptEnhancerLink = () => {
    return itemType === "image"
      ? "https://github.com/pollinations/pollinations/blob/master/image.pollinations.ai/promptEnhancer.js"
      : "https://github.com/pollinations/pollinations/blob/main/text.pollinations.ai/prompts/promptEnhancer.js";
  };

  const modelInfo = getModelInfo();

  return (
    <Box
      sx={{
        color: Colors.offwhite,
        fontSize: "1em",
        fontFamily: Fonts.parameter,
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        flexWrap: "wrap",
        gap: { xs: 1, md: 2 },
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Box>
        {"Model: "}
        <Link
          href={modelInfo.link}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          {modelInfo.name}
        </Link>
      </Box>

      <Box>
        {"Prompt Enhancer: "}
        <Link
          href={getPromptEnhancerLink()}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          Azure OpenAI
        </Link>
      </Box>

      <Box>
      {"Referrer: "}
        <Link
          href={referrer}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: Colors.lime, fontSize: "1em" }}
        >
          {formatReferrer(referrer)}
        </Link>
      </Box>
    </Box>
  );
} 