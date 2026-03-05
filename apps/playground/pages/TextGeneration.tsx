'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { GenerateTextResultPanel } from '@/components/text-generation/GenerateTextResultPanel';
import {
  buildGenerateTextOptions,
  textGenerationFormSchema,
  type TextGenerationFormValues,
  TextGenerationOptions,
} from '@/components/text-generation/TextGenerationOptions';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import { zodResolver } from '@hookform/resolvers/zod';
import { generateText } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

export default function TextGeneration() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();

  const [response, setResponse] = useState<Awaited<
    ReturnType<typeof generateText>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<TextGenerationFormValues>({
    resolver: zodResolver(textGenerationFormSchema),
    defaultValues: {
      prompt: 'Tell me a funny fact about dogs',
      model: 'gemini-fast',
    },
  });

  const modalities = form.watch('modalities');
  const thinkingEnabled = form.watch('thinkingEnabled');

  const onSubmit = async (data: TextGenerationFormValues) => {
    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations(data.model);
      const generateOptions = {
        model,
        prompt: data.prompt,
        ...buildGenerateTextOptions(data),
      };

      const result = await generateText(generateOptions);

      setResponse(result);
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
              title="Text Generation"
              subtitle="Generate text using Pollinations AI models with customizable parameters."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={loading}
              description="Select the AI model to use for text generation."
            />

            <TextGenerationOptions
              form={form}
              loading={loading}
              modalities={modalities}
              thinkingEnabled={thinkingEnabled ?? undefined}
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
              {loading ? 'Generating...' : 'Generate Text'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={<GenerateTextResultPanel response={response} />}
    />
  );
}
