'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { type ModelOption } from './ModelSelector';

// Shared mapping of feature labels to emojis used across model-related UI.
export const FEATURE_EMOJI: Record<string, string> = {
  'Text input': '📝',
  'Image input': '🖼️',
  'Audio input': '🎤',
  'Video input': '🎥',
  'Text output': '📤',
  'Image output': '📷',
  'Audio output': '🔊',
  'Video output': '📺',
  Tools: '🛠️',
  Reasoning: '🧠',
  Specialized: '🎯',
  Text: '📝',
  Image: '🖼️',
  Video: '🎬',
  'Search / Web': '🔍',
};

// API Response type
interface PollinationsModel {
  name: string;
  aliases: string[];
  description: string;
  pricing?: {
    currency: string;
    promptTextTokens?: number;
    promptCachedTokens?: number;
    completionTextTokens?: number;
    completionImageTokens?: number;
    completionVideoTokens?: number;
    completionVideoSeconds?: number;
  };
  input_modalities?: string[];
  output_modalities?: string[];
  tools?: boolean;
  reasoning?: boolean;
  is_specialized?: boolean;
}

// Hardcoded fallback models based on current API response
// These should be updated when the API response changes significantly
const FALLBACK_TEXT_MODELS_RAW: readonly PollinationsModel[] = [
  {
    name: 'openai',
    aliases: [],
    description: 'OpenAI GPT-5 Mini - Fast & Balanced',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'openai-fast',
    aliases: ['gpt-5-nano', 'gpt-5-nano-2025-08-07'],
    description: 'OpenAI GPT-5 Nano - Ultra Fast & Affordable',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'openai-large',
    aliases: ['gpt-5.2', 'openai-reasoning', 'gpt-5.2-reasoning'],
    description: 'OpenAI GPT-5.2 - Most Powerful & Intelligent',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'openai-audio',
    aliases: [
      'gpt-4o-mini-audio-preview',
      'gpt-4o-mini-audio-preview-2024-12-17',
    ],
    description: 'OpenAI GPT-4o Mini Audio - Voice Input & Output',
    input_modalities: ['text', 'image', 'audio'],
    output_modalities: ['audio', 'text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'gemini',
    aliases: ['gemini-3-flash', 'gemini-3-flash-preview'],
    description: 'Google Gemini 3 Flash - Pro-Grade Reasoning at Flash Speed',
    input_modalities: ['text', 'image', 'audio', 'video'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'gemini-fast',
    aliases: ['gemini-2.5-flash-lite'],
    description: 'Google Gemini 2.5 Flash Lite - Ultra Fast & Cost-Effective',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'deepseek',
    aliases: ['deepseek-v3', 'deepseek-reasoning'],
    description: 'DeepSeek V3.2 - Efficient Reasoning & Agentic AI',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'grok',
    aliases: ['grok-fast', 'grok-4', 'grok-4-fast'],
    description: 'xAI Grok 4 Fast - High Speed & Real-Time',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'gemini-search',
    aliases: ['gemini-3-flash-search'],
    description: 'Google Gemini 3 Flash - With Google Search',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: false,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'chickytutor',
    aliases: [],
    description: 'ChickyTutor AI Language Tutor - (chickytutor.com)',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: true,
  },
  {
    name: 'midijourney',
    aliases: [],
    description: 'MIDIjourney - AI Music Composition Assistant',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: true,
  },
  {
    name: 'claude-fast',
    aliases: ['claude-haiku-4.5', 'claude-haiku'],
    description: 'Anthropic Claude Haiku 4.5 - Fast & Intelligent',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'claude',
    aliases: ['claude-sonnet-4.5', 'claude-sonnet'],
    description: 'Anthropic Claude Sonnet 4.5 - Most Capable & Balanced',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'claude-large',
    aliases: ['claude-opus-4.5', 'claude-opus'],
    description: 'Anthropic Claude Opus 4.5 - Most Intelligent Model',
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'perplexity-fast',
    aliases: ['sonar'],
    description: 'Perplexity Sonar - Fast & Affordable with Web Search',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: false,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'perplexity-reasoning',
    aliases: ['sonar-reasoning', 'sonar-reasoning-pro'],
    description:
      'Perplexity Sonar Reasoning - Advanced Reasoning with Web Search',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: false,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'qwen-coder',
    aliases: ['qwen3-coder', 'qwen3-coder-30b-a3b-instruct'],
    description: 'Qwen3 Coder 30B - Specialized for Code Generation',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'gemini-large',
    aliases: ['gemini-3-pro', 'gemini-3', 'gemini-3-pro-preview'],
    description:
      'Google Gemini 3 Pro - Most Intelligent Model with 1M Context (Preview)',
    input_modalities: ['text', 'image', 'audio', 'video'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'nova-fast',
    aliases: ['amazon-nova-micro', 'nova', 'nova-micro'],
    description: 'Amazon Nova Micro - Ultra Fast & Ultra Cheap',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
  {
    name: 'glm',
    aliases: ['glm-4.7', 'glm-4p7'],
    description: 'Z.ai GLM-4.7 - Coding, Reasoning & Agentic Workflows',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'minimax',
    aliases: ['minimax-m2.1', 'minimax-m2p1'],
    description: 'MiniMax M2.1 - Multi-Language & Agent Workflows',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: true,
    is_specialized: false,
  },
  {
    name: 'nomnom',
    aliases: ['gemini-scrape', 'web-research'],
    description:
      'NomNom by @Itachi-1824 - Web Research with Search, Scrape & Crawl (Alpha)',
    input_modalities: ['text'],
    output_modalities: ['text'],
    tools: true,
    reasoning: false,
    is_specialized: false,
  },
] as const;

const FALLBACK_IMAGE_MODELS_RAW: readonly PollinationsModel[] = [
  {
    name: 'kontext',
    aliases: [],
    description: 'FLUX.1 Kontext - In-context editing & generation',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'turbo',
    aliases: [],
    description: 'SDXL Turbo - Single-step real-time generation',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'nanobanana',
    aliases: [],
    description: 'NanoBanana - Gemini 2.5 Flash Image',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'nanobanana-pro',
    aliases: [],
    description: 'NanoBanana Pro - Gemini 3 Pro Image (4K, Thinking)',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'seedream',
    aliases: [],
    description: 'Seedream 4.0 - ByteDance ARK (better quality)',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'seedream-pro',
    aliases: [],
    description: 'Seedream 4.5 Pro - ByteDance ARK (4K, Multi-Image)',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'gptimage',
    aliases: [],
    description: "GPT Image 1 Mini - OpenAI's image generation model",
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'gptimage-large',
    aliases: [],
    description: "GPT Image 1.5 - OpenAI's advanced image generation model",
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'flux',
    aliases: [],
    description: 'Flux Schnell - Fast high-quality image generation',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'zimage',
    aliases: [],
    description: 'Z-Image Turbo - Fast 6B Flux with 2x upscaling',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
  {
    name: 'klein',
    aliases: [],
    description: 'FLUX.2 Klein 4B - Fast image generation & editing on Modal',
    input_modalities: ['text'],
    output_modalities: ['image'],
  },
] as const;

const FALLBACK_VIDEO_MODELS_RAW: readonly PollinationsModel[] = [
  {
    name: 'veo',
    aliases: [],
    description: "Veo 3.1 Fast - Google's video generation model (preview)",
    input_modalities: ['text'],
    output_modalities: ['video'],
  },
  {
    name: 'seedance',
    aliases: [],
    description: 'Seedance Lite - BytePlus video generation (better quality)',
    input_modalities: ['text'],
    output_modalities: ['video'],
  },
  {
    name: 'seedance-pro',
    aliases: [],
    description:
      'Seedance Pro-Fast - BytePlus video generation (better prompt adherence)',
    input_modalities: ['text'],
    output_modalities: ['video'],
  },
] as const;

interface ModelsContextValue {
  textModels: readonly ModelOption[];
  imageModels: readonly ModelOption[];
  videoModels: readonly ModelOption[];
  allModels: readonly ModelOption[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

function sortModels(models: readonly ModelOption[]): readonly ModelOption[] {
  return [...models].sort((a, b) => a.name.localeCompare(b.name));
}

function buildFeatures(
  model: PollinationsModel,
  category: 'text' | 'image' | 'video',
): { features: string[]; featuresTitle?: string } {
  const features: string[] = [];
  const emojis: string[] = [];

  const inputs = model.input_modalities ?? [];
  const outputs = model.output_modalities ?? [];

  const add = (condition: boolean, label: string) => {
    if (!condition) return;
    if (features.includes(label)) return;
    features.push(label);
    const emoji = FEATURE_EMOJI[label];
    if (emoji && !emojis.includes(emoji)) {
      emojis.push(emoji);
    }
  };

  add(inputs.includes('text'), 'Text input');
  add(inputs.includes('image'), 'Image input');
  add(inputs.includes('audio'), 'Audio input');
  add(inputs.includes('video'), 'Video input');

  add(outputs.includes('text'), 'Text output');
  add(outputs.includes('image'), 'Image output');
  add(outputs.includes('audio'), 'Audio output');
  add(outputs.includes('video'), 'Video output');

  add(!!model.tools, 'Tools');
  add(!!model.reasoning, 'Reasoning');
  add(!!model.is_specialized, 'Specialized');

  // Heuristic: detect search / web search support from name & description
  const textForSearch =
    `${model.name} ${model.description} ${model.aliases?.join(' ') ?? ''}`.toLowerCase();
  if (textForSearch.includes('search')) {
    add(true, 'Search / Web');
  }

  // Basic category fallback if no explicit modalities:
  if (features.length === 0) {
    if (category === 'text') {
      add(true, 'Text');
    } else if (category === 'image') {
      add(true, 'Image');
    } else if (category === 'video') {
      add(true, 'Video');
    }
  }

  return {
    features,
    featuresTitle: emojis.length > 0 ? emojis.join(' ') : undefined,
  };
}

function transformApiModelToOption(
  model: PollinationsModel,
  category: 'text' | 'image' | 'video',
): ModelOption {
  const fullDescription = model.description || '';
  const [short] = fullDescription.split(' - ');
  const descriptionShort = short?.trim() || fullDescription;
  const { features, featuresTitle } = buildFeatures(model, category);

  return {
    id: model.name,
    name: model.name,
    description: fullDescription,
    descriptionShort,
    category,
    features,
    featuresTitle,
  };
}

const FALLBACK_TEXT_MODELS: readonly ModelOption[] =
  FALLBACK_TEXT_MODELS_RAW.map((model) =>
    transformApiModelToOption(model, 'text'),
  );

const FALLBACK_IMAGE_MODELS: readonly ModelOption[] =
  FALLBACK_IMAGE_MODELS_RAW.map((model) =>
    transformApiModelToOption(model, 'image'),
  );

const FALLBACK_VIDEO_MODELS: readonly ModelOption[] =
  FALLBACK_VIDEO_MODELS_RAW.map((model) =>
    transformApiModelToOption(model, 'video'),
  );

async function fetchTextModels(): Promise<ModelOption[]> {
  try {
    const response = await fetch('https://gen.pollinations.ai/text/models');
    if (!response.ok) {
      throw new Error(`Failed to fetch text models: ${response.statusText}`);
    }
    const apiModels: PollinationsModel[] = await response.json();
    return apiModels.map((model) => transformApiModelToOption(model, 'text'));
  } catch (error) {
    console.error('Error fetching text models:', error);
    throw error;
  }
}

async function fetchImageVideoModels(): Promise<ModelOption[]> {
  try {
    const response = await fetch('https://gen.pollinations.ai/image/models');
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image/video models: ${response.statusText}`,
      );
    }
    const apiModels: PollinationsModel[] = await response.json();
    return apiModels.map((model) => {
      // Determine category based on output_modalities
      const outputModalities = model.output_modalities || [];
      const category = outputModalities.includes('video') ? 'video' : 'image';
      return transformApiModelToOption(model, category);
    });
  } catch (error) {
    console.error('Error fetching image/video models:', error);
    throw error;
  }
}

interface ModelsProviderProps {
  children: ReactNode;
}

export function ModelsProvider({ children }: ModelsProviderProps) {
  const [textModels, setTextModels] =
    useState<readonly ModelOption[]>(FALLBACK_TEXT_MODELS);
  const [imageModels, setImageModels] = useState<readonly ModelOption[]>(
    FALLBACK_IMAGE_MODELS,
  );
  const [videoModels, setVideoModels] = useState<readonly ModelOption[]>(
    FALLBACK_VIDEO_MODELS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedTextModels, fetchedImageVideoModels] = await Promise.all([
        fetchTextModels(),
        fetchImageVideoModels(),
      ]);

      setTextModels(sortModels(fetchedTextModels));

      // Split image/video models based on category
      const image = fetchedImageVideoModels.filter(
        (m) => m.category === 'image',
      );
      const video = fetchedImageVideoModels.filter(
        (m) => m.category === 'video',
      );

      setImageModels(sortModels(image));
      setVideoModels(sortModels(video));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
      // Use fallback models on error
      setTextModels(sortModels(FALLBACK_TEXT_MODELS));
      setImageModels(sortModels(FALLBACK_IMAGE_MODELS));
      setVideoModels(sortModels(FALLBACK_VIDEO_MODELS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allModels = React.useMemo(
    () => [...textModels, ...imageModels, ...videoModels],
    [textModels, imageModels, videoModels],
  );

  const value: ModelsContextValue = {
    textModels,
    imageModels,
    videoModels,
    allModels,
    loading,
    error,
    refresh,
  };

  return (
    <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
  );
}

export function useModels() {
  const context = useContext(ModelsContext);
  if (!context) {
    throw new Error('useModels must be used within a ModelsProvider');
  }
  return context;
}

export function useTextModels(): readonly ModelOption[] {
  try {
    const { textModels } = useModels();
    return textModels;
  } catch {
    return FALLBACK_TEXT_MODELS;
  }
}

export function useImageModels(): readonly ModelOption[] {
  try {
    const { imageModels } = useModels();
    return imageModels;
  } catch {
    return FALLBACK_IMAGE_MODELS;
  }
}

export function useVideoModels(): readonly ModelOption[] {
  try {
    const { videoModels } = useModels();
    return videoModels;
  } catch {
    return FALLBACK_VIDEO_MODELS;
  }
}

export function useSpeechModels(): readonly ModelOption[] {
  try {
    const { textModels } = useModels();
    // Filter models that support audio output
    return textModels.filter((model) =>
      model.features?.includes('Audio output'),
    );
  } catch {
    // Fallback: return only openai-audio from fallback models
    return FALLBACK_TEXT_MODELS.filter((model) =>
      model.features?.includes('Audio output'),
    );
  }
}
