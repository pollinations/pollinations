'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useVideoModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import {
  buildGenerateVideoOptions,
  videoGenerationFormSchema,
  type VideoGenerationFormValues,
  VideoGenerationOptions,
} from '@/components/image-generation/VideoGenerationOptions';
import { VideoResultPanel } from '@/components/image-generation/VideoResultPanel';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateImage, type GenerateImageResult } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

export default function VideoGeneration() {
  const { apiKey } = usePollinationsApiKey();
  const availableVideoModels = useVideoModels();

  const [result, setResult] = useState<GenerateImageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<VideoGenerationFormValues>({
    resolver: zodResolver(videoGenerationFormSchema),
    defaultValues: {
      prompt: 'A majestic lion in the savanna at sunset',
      model: 'seedance',
    },
  });

  const selectedModel = form.watch('model');

  const onSubmit = async (data: VideoGenerationFormValues) => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations.imageModel(data.model as any);
      const generateOptions = {
        model,
        prompt: data.prompt,
        ...buildGenerateVideoOptions(data),
      };

      const result = await generateImage(generateOptions);
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
              title="Video Generation"
              subtitle="Generate videos using Pollinations AI models with customizable parameters."
            />
            <ModelSelector
              form={form}
              name="model"
              models={availableVideoModels}
              disabled={loading}
              description="Select the AI model to use for video generation."
            />

            <VideoGenerationOptions
              form={form}
              loading={loading}
              selectedModel={selectedModel}
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
              {loading ? 'Generating...' : 'Generate Video'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={<VideoResultPanel result={result} />}
    />
  );
}
