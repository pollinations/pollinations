import { useState, useCallback, useEffect, useRef } from 'react';
import { ImageConfigClient } from '../utils/imageConfigClient';
import { PollinationsService } from '../services/pollinations';
import { RENDER_SIZE_PRESETS, RenderSize, ClientImageSection } from '../utils/clientImageConfig';

export interface PollenImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  isGenerating?: boolean;
  error?: string;
}

export interface UsePollenImagePoolReturn {
  getCurrentImage: (sectionId: string) => PollenImage | null;
  regenerateImage: (sectionId: string, customDescription?: string) => Promise<void>;
  deleteImage: (sectionId: string) => void;
  isGenerating: (sectionId: string) => boolean;
  getError: (sectionId: string) => string | null;
  reinitializePool: () => Promise<void>;
}

export interface UsePollenImagePoolOptions {
  apiToken?: string | null;
  model?: string;
}

export function usePollenImagePool(options?: UsePollenImagePoolOptions): UsePollenImagePoolReturn {
  const [imagePool, setImagePool] = useState<Record<string, PollenImage | null>>({});
  const pollinationsService = useRef<PollinationsService | null>(null);

  // Sync token to service when it changes
  useEffect(() => {
    if (pollinationsService.current) {
      pollinationsService.current.setToken(options?.apiToken ?? null);
    }
  }, [options?.apiToken]);

  const initializePool = useCallback(async () => {
    try {
      const config = await ImageConfigClient.load();

      if (!pollinationsService.current) {
        pollinationsService.current = new PollinationsService();
        pollinationsService.current.setToken(options?.apiToken ?? null);
      }

      const pool: Record<string, PollenImage | null> = {};

      for (const section of config.sections) {
        const existingImages = config.imageSelections[section.id] || [];
        // Use the first image if available, otherwise null
        if (existingImages.length > 0) {
          pool[section.id] = {
            id: `${section.id}-config-0`,
            url: existingImages[0],
            prompt: '',
            timestamp: Date.now()
          };
        } else {
          pool[section.id] = null;
        }
      }

      setImagePool(pool);
    } catch (error) {
      console.error('Failed to load image config:', error);
      setImagePool({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initializePool();
  }, [initializePool]);

  const getCurrentImage = useCallback((sectionId: string): PollenImage | null => {
    return imagePool[sectionId] || null;
  }, [imagePool]);

  const regenerateImage = useCallback(async (sectionId: string, customDescription?: string) => {
    let config: { sections: ClientImageSection[]; project?: string; imageUrl?: string } | null;
    let prompt: string;

    try {
      config = await ImageConfigClient.load();
      const sectionData = config.sections.find((s: ClientImageSection) => s.id === sectionId);
      prompt = customDescription || sectionData?.description || `Generate an image for section ${sectionId}`;

      if (!pollinationsService.current) {
        pollinationsService.current = new PollinationsService();
      }
    } catch (error) {
      console.error('Failed to load section data:', error);
      prompt = customDescription || `Generate an image for section ${sectionId}`;
      config = null;
    }

    const newImageId = `${sectionId}-${Date.now()}`;

    // Set generating placeholder
    setImagePool(prev => ({
      ...prev,
      [sectionId]: {
        id: newImageId,
        url: '',
        prompt,
        timestamp: Date.now(),
        isGenerating: true
      }
    }));

    try {
      const sectionData = config?.sections.find((s: ClientImageSection) => s.id === sectionId);
      const renderSize: RenderSize = sectionData?.renderSize || '1024x1024';
      const sizePreset = RENDER_SIZE_PRESETS[renderSize];

      const result = await pollinationsService.current!.generateImageFromPrompt(
        prompt,
        config?.project,
        {
          seed: Math.floor(Math.random() * 1000000),
          width: sizePreset.width,
          height: sizePreset.height,
          ...(options?.model && { model: options.model }),
        },
        config?.imageUrl
      );

      const imageUrl = result.url;

      // Save generated image to config (replace existing)
      try {
        await ImageConfigClient.replaceImages(sectionId, [imageUrl]);
      } catch (configError) {
        console.warn('Failed to save image to config:', configError);
      }

      // Update with actual image
      setImagePool(prev => {
        const current = prev[sectionId];
        if (current?.id === newImageId) {
          return { ...prev, [sectionId]: { ...current, url: imageUrl, isGenerating: false } };
        }
        return prev;
      });
    } catch (error) {
      console.error('Failed to generate image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Image generation failed';
      setImagePool(prev => {
        const current = prev[sectionId];
        if (current?.id === newImageId) {
          return { ...prev, [sectionId]: { ...current, isGenerating: false, error: errorMessage } };
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.model]);

  const isGenerating = useCallback((sectionId: string): boolean => {
    return imagePool[sectionId]?.isGenerating || false;
  }, [imagePool]);

  const getError = useCallback((sectionId: string): string | null => {
    return imagePool[sectionId]?.error || null;
  }, [imagePool]);

  const deleteImage = useCallback(async (sectionId: string) => {
    const image = imagePool[sectionId];
    if (!image) return;

    setImagePool(prev => ({ ...prev, [sectionId]: null }));

    if (image.url) {
      try {
        await ImageConfigClient.replaceImages(sectionId, []);
      } catch (error) {
        console.error('Failed to remove image from config:', error);
      }
    }
  }, [imagePool]);

  const reinitializePool = useCallback(async () => {
    try {
      const config = await ImageConfigClient.load();
      const pool: Record<string, PollenImage | null> = {};

      for (const section of config.sections) {
        const imageUrls = config.imageSelections[section.id] || [];
        if (imageUrls.length > 0) {
          pool[section.id] = {
            id: `${section.id}-0`,
            url: imageUrls[0],
            prompt: section.description || '',
            timestamp: Date.now(),
            isGenerating: false
          };
        } else {
          pool[section.id] = null;
        }
      }

      setImagePool(pool);
    } catch (error) {
      console.error('Failed to reinitialize image pool:', error);
    }
  }, []);

  return {
    getCurrentImage,
    regenerateImage,
    deleteImage,
    isGenerating,
    getError,
    reinitializePool
  };
}
