'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { SourcesList } from '@/components/text-generation/SourcesList';
import {
  buildGenerateTextOptions,
  textGenerationFormSchema,
  type TextGenerationFormValues,
  TextGenerationOptions,
} from '@/components/text-generation/TextGenerationOptions';
import { TextResult } from '@/components/text-generation/TextResult';
import { UsageCard } from '@/components/text-generation/UsageCard';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { type LanguageModelUsage, streamText } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

export default function Streaming() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();

  const [streamedText, setStreamedText] = useState<string>('');
  const [reasoningText, setReasoningText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<LanguageModelUsage | null>(null);
  const [sources, setSources] = useState<any[] | undefined>([]);
  const [error, setError] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const form = useForm<TextGenerationFormValues>({
    resolver: zodResolver(textGenerationFormSchema),
    defaultValues: {
      prompt: 'Tell me 10 short jokes about programming',
      model: 'gemini-fast',
    },
  });

  const modalities = form.watch('modalities');
  const thinkingEnabled = form.watch('thinkingEnabled');

  const onSubmit = async (data: TextGenerationFormValues) => {
    setIsStreaming(true);
    setError('');
    setStreamedText('');
    setReasoningText('');
    setUsage(null);
    setSources([]);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations(data.model);
      const streamOptions = {
        model,
        prompt: data.prompt,
        abortSignal: abortControllerRef.current.signal,
        ...buildGenerateTextOptions(data),
      };

      const result = streamText(streamOptions);

      let fullText = '';
      let fullReasoning = '';

      // Stream all parts (text + reasoning) as they arrive
      for await (const part of result.fullStream) {
        const type = part.type;

        if (type === 'text-delta') {
          if (part.text) {
            fullText += part.text;
            setStreamedText(fullText);
          }
        } else if (type === 'reasoning-delta') {
          if (part.text) {
            fullReasoning += part.text;
            setReasoningText(fullReasoning);
          }
        }
      }

      // Get final results
      const finalUsage = await result.usage;
      const finalSources = await result.sources;

      setUsage(finalUsage);
      setSources(finalSources ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Stream was cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Streaming error:', err);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <TwoPaneView
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Streaming"
              subtitle="Stream text generation in real-time using Pollinations AI models."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={isStreaming}
              description="Select the AI model to use for streaming text generation."
            />

            <TextGenerationOptions
              form={form}
              loading={isStreaming}
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
                    disabled={isStreaming}
                    rows={4}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isStreaming}
                className="w-full sm:w-auto"
              >
                {isStreaming ? 'Streaming...' : 'Start Streaming'}
              </Button>
              {isStreaming && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleStop}
                  className="w-full sm:w-auto"
                >
                  Stop
                </Button>
              )}
            </div>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={
        <>
          {reasoningText && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Reasoning</h3>
              </div>
              <div className="rounded-md border bg-muted/50 p-4 min-h-[100px]">
                <div className="text-sm whitespace-pre-wrap font-mono">
                  {reasoningText}
                </div>
              </div>
            </div>
          )}

          <TextResult
            text={streamedText}
            placeholder='No stream yet. Enter a prompt and click "Start Streaming" to see real-time text generation.'
          />

          <SourcesList sources={sources ?? []} />

          {usage && <UsageCard usage={usage} showSectionTitle />}
        </>
      }
    />
  );
}
