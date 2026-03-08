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
  'Text input': '\u{1F4DD}',
  'Image input': '\u{1F5BC}\uFE0F',
  'Audio input': '\u{1F3A4}',
  'Video input': '\u{1F3A5}',
  'Text output': '\u{1F4E4}',
  'Image output': '\u{1F4F7}',
  'Audio output': '\u{1F50A}',
  'Video output': '\u{1F4FA}',
  Tools: '\u{1F6E0}\uFE0F',
  Reasoning: '\u{1F9E0}',
  Specialized: '\u{1F3AF}',
  Text: '\u{1F4DD}',
  Image: '\u{1F5BC}\uFE0F',
  Video: '\u{1F3AC}',
  'Search / Web': '\u{1F50D}',
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const CACHE_KEYS = {
  text: 'pollinations_models_text',
  image: 'pollinations_models_image',
  audio: 'pollinations_models_audio',
} as const;

const API_ENDPOINTS = {
  text: 'https://gen.pollinations.ai/text/models',
  image: 'https://gen.pollinations.ai/image/models',
  audio: 'https://gen.pollinations.ai/audio/models',
} as const;

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
    completionAudioTokens?: number;
    completionAudioSeconds?: number;
    promptAudioSeconds?: number;
  };
  input_modalities?: string[];
  output_modalities?: string[];
  tools?: boolean;
  reasoning?: boolean;
  is_specialized?: boolean;
  paid_only?: boolean;
  context_length?: number;
  voices?: string[];
}

interface CachedData<T> {
  data: T;
  timestamp: number;
}

function getFromCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: CachedData<T> = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

interface ModelsContextValue {
  textModels: readonly ModelOption[];
  imageModels: readonly ModelOption[];
  videoModels: readonly ModelOption[];
  audioModels: readonly ModelOption[];
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
  category: 'text' | 'image' | 'video' | 'audio',
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
  category: 'text' | 'image' | 'video' | 'audio',
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
    paidOnly: model.paid_only === true,
    voices: model.voices,
  };
}

async function fetchModelsFromEndpoint(
  endpoint: string,
  cacheKey: string,
): Promise<PollinationsModel[]> {
  // Try cache first
  const cached = getFromCache<PollinationsModel[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${endpoint}: ${response.statusText}`);
  }
  const models: PollinationsModel[] = await response.json();
  setCache(cacheKey, models);
  return models;
}

interface ModelsProviderProps {
  children: ReactNode;
}

export function ModelsProvider({ children }: ModelsProviderProps) {
  const [textModels, setTextModels] = useState<readonly ModelOption[]>([]);
  const [imageModels, setImageModels] = useState<readonly ModelOption[]>([]);
  const [videoModels, setVideoModels] = useState<readonly ModelOption[]>([]);
  const [audioModels, setAudioModels] = useState<readonly ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [textRaw, imageVideoRaw, audioRaw] = await Promise.all([
        fetchModelsFromEndpoint(API_ENDPOINTS.text, CACHE_KEYS.text),
        fetchModelsFromEndpoint(API_ENDPOINTS.image, CACHE_KEYS.image),
        fetchModelsFromEndpoint(API_ENDPOINTS.audio, CACHE_KEYS.audio),
      ]);

      setTextModels(
        sortModels(textRaw.map((m) => transformApiModelToOption(m, 'text'))),
      );

      // Split image/video models based on output_modalities
      const imageList: ModelOption[] = [];
      const videoList: ModelOption[] = [];
      for (const m of imageVideoRaw) {
        const outputs = m.output_modalities || [];
        if (outputs.includes('video')) {
          videoList.push(transformApiModelToOption(m, 'video'));
        } else {
          imageList.push(transformApiModelToOption(m, 'image'));
        }
      }
      setImageModels(sortModels(imageList));
      setVideoModels(sortModels(videoList));

      setAudioModels(
        sortModels(audioRaw.map((m) => transformApiModelToOption(m, 'audio'))),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allModels = React.useMemo(
    () => [...textModels, ...imageModels, ...videoModels, ...audioModels],
    [textModels, imageModels, videoModels, audioModels],
  );

  const value: ModelsContextValue = {
    textModels,
    imageModels,
    videoModels,
    audioModels,
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
    return [];
  }
}

export function useImageModels(): readonly ModelOption[] {
  try {
    const { imageModels } = useModels();
    return imageModels;
  } catch {
    return [];
  }
}

export function useVideoModels(): readonly ModelOption[] {
  try {
    const { videoModels } = useModels();
    return videoModels;
  } catch {
    return [];
  }
}

export function useAudioModels(): readonly ModelOption[] {
  try {
    const { audioModels } = useModels();
    return audioModels;
  } catch {
    return [];
  }
}

export function useSpeechModels(): readonly ModelOption[] {
  try {
    const { audioModels } = useModels();
    // Filter to TTS models (text input, audio output)
    return audioModels.filter(
      (m) =>
        m.features?.includes('Text input') &&
        m.features?.includes('Audio output'),
    );
  } catch {
    return [];
  }
}
