'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { GenerateTextResultPanel } from '@/components/text-generation/GenerateTextResultPanel';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateText, Output } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Schema for person information extraction
const personSchema = z.object({
  name: z.string().describe('Person full name'),
  age: z.number().describe('Person age in years'),
  email: z.string().email().describe('Person email address'),
  hobbies: z.array(z.string()).describe('List of hobbies'),
});

// Form schema
const structuredOutputFormSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string(),
});

type StructuredOutputFormValues = z.infer<typeof structuredOutputFormSchema>;

export default function StructuredOutputs() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();

  const [response, setResponse] = useState<Awaited<
    ReturnType<typeof generateText>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const form = useForm<StructuredOutputFormValues>({
    resolver: zodResolver(structuredOutputFormSchema),
    defaultValues: {
      prompt: `Extract the person information from this text:
"John Doe is 30 years old. His email is john.doe@example.com.
He enjoys reading, hiking, and photography."`,
      model: 'gemini-fast',
    },
  });

  const onSubmit = async (data: StructuredOutputFormValues) => {
    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations(data.model);

      const result = await generateText({
        model,
        output: Output.object({
          name: 'person',
          schema: personSchema,
        }),
        prompt: data.prompt,
        temperature: 1.0,
      });

      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TwoPaneView
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Structured Outputs"
              subtitle="Generate structured data using Pollinations AI models with schema validation."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={loading}
              description="Select the AI model to use for structured output generation."
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormFieldItem label="Prompt *">
                  <Textarea
                    placeholder="Enter your prompt here..."
                    disabled={loading}
                    rows={8}
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
              {loading ? 'Generating...' : 'Generate Structured Output'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={<GenerateTextResultPanel response={response} />}
    />
  );
}
