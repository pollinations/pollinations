'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useSpeechModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { SpeechResultPanel } from '@/components/speech-generation/SpeechResultPanel';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { zodResolver } from '@hookform/resolvers/zod';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const speechFormSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  model: z.string(),
  voice: z.enum([
    'alloy',
    'echo',
    'fable',
    'onyx',
    'shimmer',
    'coral',
    'verse',
    'ballad',
    'ash',
    'sage',
    'amuch',
    'dan',
  ]),
  outputFormat: z.enum(['mp3', 'wav', 'flac', 'opus', 'pcm16']),
  instructions: z.string().optional(),
});

type SpeechFormValues = z.infer<typeof speechFormSchema>;

const VOICES = [
  'alloy',
  'echo',
  'fable',
  'onyx',
  'shimmer',
  'coral',
  'verse',
  'ballad',
  'ash',
  'sage',
  'amuch',
  'dan',
] as const;

const OUTPUT_FORMATS = ['mp3', 'wav', 'flac', 'opus', 'pcm16'] as const;

export default function SpeechGeneration() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useSpeechModels();

  const [response, setResponse] = useState<Awaited<
    ReturnType<typeof generateSpeech>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<SpeechFormValues>({
    resolver: zodResolver(speechFormSchema),
    defaultValues: {
      text: 'The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet, making it perfect for testing text-to-speech systems. Artificial intelligence has revolutionized the way we interact with technology, enabling natural language processing, computer vision, and machine learning applications that were once thought impossible.',
      model: 'openai-audio',
      voice: 'alloy',
      outputFormat: 'mp3',
      instructions:
        'You are a professional narrator. Read the text clearly and naturally, with appropriate pacing and emphasis.',
    },
  });

  const onSubmit = async (data: SpeechFormValues) => {
    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations.speechModel(data.model as any);

      const result = await generateSpeech({
        model,
        text: data.text,
        voice: data.voice,
        outputFormat: data.outputFormat,
        ...(data.instructions && { instructions: data.instructions }),
      });

      console.log('result', result);

      setResponse(result);
      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Speech generation error:', err);
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
              title="Speech Generation"
              subtitle="Generate speech/audio from text using Pollinations AI models."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={loading}
              description="Select the AI model to use for speech generation."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="voice"
                render={({ field }) => (
                  <FormFieldItem label="Voice *">
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loading}
                    >
                      <SelectTrigger className={'w-full'}>
                        <SelectValue placeholder="Select a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICES.map((voice) => (
                          <SelectItem key={voice} value={voice}>
                            {voice.charAt(0).toUpperCase() + voice.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormFieldItem>
                )}
              />

              <FormField
                control={form.control}
                name="outputFormat"
                render={({ field }) => (
                  <FormFieldItem label="Output Format *">
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loading}
                    >
                      <SelectTrigger className={'w-full'}>
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTPUT_FORMATS.map((format) => (
                          <SelectItem key={format} value={format}>
                            {format.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormFieldItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormFieldItem label="Text *">
                  <Textarea
                    placeholder="Enter text to convert to speech..."
                    disabled={loading}
                    rows={4}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormFieldItem label="Instructions (Optional)">
                  <Textarea
                    placeholder="Optional instructions for the voice..."
                    disabled={loading}
                    rows={2}
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
              {loading ? 'Generating...' : 'Generate Speech'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={<SpeechResultPanel result={response} />}
    />
  );
}
