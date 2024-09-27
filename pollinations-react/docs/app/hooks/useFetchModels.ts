import { useState, useEffect } from 'react';

interface TextModel {
  name: string;
  type: 'chat' | 'completion';
  censored: boolean;
}

type ImageModel = string;

export function useFetchModels() {
  const [textModels, setTextModels] = useState<TextModel[]>([]);
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const [textResponse, imageResponse] = await Promise.all([
          fetch('https://text.pollinations.ai/models'),
          fetch('https://image.pollinations.ai/models')
        ]);
        const textData: TextModel[] = await textResponse.json();
        const imageData: ImageModel[] = await imageResponse.json();
        setTextModels(textData);
        setImageModels(imageData);
      } catch (error) {
        console.error('Error fetching models:', error);
        // Fallback models
        setTextModels([{ name: 'openai', type: 'chat', censored: false }]);
        setImageModels(['flux']);
      }
    };
    fetchModels();
  }, []);

  return { textModels, imageModels };
}