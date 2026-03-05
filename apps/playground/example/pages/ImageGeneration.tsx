'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import {
  buildGenerateImageOptions,
  imageGenerationFormSchema,
  type ImageGenerationFormValues,
  ImageGenerationOptions,
  isGptImageModel,
} from '@/components/image-generation/ImageGenerationOptions';
import { ImageResultPanel } from '@/components/image-generation/ImageResultPanel';
import { ModelSelector } from '@/components/ModelSelector';
import { useImageModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateImage, type GenerateImageResult } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

export default function ImageGeneration() {
  const { apiKey } = usePollinationsApiKey();
  const availableImageModels = useImageModels();

  const [result, setResult] = useState<GenerateImageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<ImageGenerationFormValues>({
    resolver: zodResolver(imageGenerationFormSchema),
    defaultValues: {
      prompt: 'A majestic lion in the savanna at sunset',
      model: 'zimage',
    },
  });

  const selectedModel = form.watch('model');
  const isGptImage = isGptImageModel(selectedModel);

  const onSubmit = async (data: ImageGenerationFormValues) => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations.imageModel(data.model);

      const generateOptions = buildGenerateImageOptions(data, isGptImage);
      const result = await generateImage({
        model,
        prompt: data.prompt,
        ...generateOptions,
      });

      setResult(result);
      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoPaneView
      resultRef={resultRef}
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Image Generation"
              subtitle="Generate images using Pollinations AI models with customizable parameters."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableImageModels}
              disabled={loading}
              description="Select the AI model to use for image generation."
            />

            <ImageGenerationOptions
              form={form}
              loading={loading}
              isGptImage={isGptImage}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormFieldItem label="Prompt *">
                  <Textarea
                    placeholder="Enter your prompt here..."
                    disabled={loading}
                    rows={4}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? 'Generating...' : 'Generate Image'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={<ImageResultPanel result={result} />}
    />
  );
}
