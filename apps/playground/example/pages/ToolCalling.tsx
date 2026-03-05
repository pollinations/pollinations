'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import { GenerateTextResultPanel } from '@/components/text-generation/GenerateTextResultPanel';
import { SourcesList } from '@/components/text-generation/SourcesList';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateText, GenerateTextResult, tool } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const toolCallingFormSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string(),
});

type ToolCallingFormValues = z.infer<typeof toolCallingFormSchema>;

const tools = {
  getCurrentWeather: tool({
    description: 'Get the current weather in a given city (mocked data).',
    inputSchema: z.object({
      location: z
        .string()
        .describe('City and country, for example "Paris, France".'),
      unit: z
        .enum(['celsius', 'fahrenheit'])
        .default('celsius')
        .describe('Temperature unit.'),
    }),
    execute: async ({
      location,
      unit,
    }: {
      location: string;
      unit: 'celsius' | 'fahrenheit';
    }) => {
      // This is mocked data just for demonstration purposes.
      const baseTempC = 22;
      const temperatureC = baseTempC;
      const temperatureF = Math.round(temperatureC * (9 / 5) + 32);

      return {
        location,
        unit,
        temperature:
          unit === 'celsius' ? `${temperatureC}°C` : `${temperatureF}°F`,
        description: 'Partly cloudy with a light breeze.',
      };
    },
  }),
  getCurrentTime: tool({
    description:
      'Get the current UTC time (mocked local time, no real timezone lookup).',
    inputSchema: z.object({
      location: z
        .string()
        .describe('City and country, for example "Tokyo, Japan".'),
    }),
    execute: async ({ location }: { location: string }) => {
      const now = new Date();
      return {
        location,
        isoTime: now.toISOString(),
        note: 'This is the current UTC time; timezone conversion is not applied.',
      };
    },
  }),
};

type ToolCallInfo = {
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

export default function ToolCalling() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();

  const [response, setResponse] = useState<GenerateTextResult<any, any> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const form = useForm<ToolCallingFormValues>({
    resolver: zodResolver(toolCallingFormSchema),
    defaultValues: {
      prompt:
        'You can use tools to answer questions. For example, tell me the weather in Paris in Celsius and the current time in Tokyo, and explain your steps.',
      model: 'gemini-fast',
    },
  });

  const onSubmit = async (data: ToolCallingFormValues) => {
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
        prompt: data.prompt,
        tools,
        toolChoice: 'auto',
      });

      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Tool calling error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Extract tool calls from response
  const toolCalls: ToolCallInfo[] =
    response?.toolCalls?.map((call) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
      output: response?.toolResults?.find(
        (e) => e.toolCallId === call.toolCallId,
      )?.output, // Tool results are not included in the response
    })) ?? [];

  // Get sources directly from response
  const sources = response?.sources ?? [];

  return (
    <TwoPaneView
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Tool Calling"
              subtitle="Call typed tools from Pollinations language models using the Vercel AI SDK."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={loading}
              description="Select the AI model to use for tool calling."
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormFieldItem label="Prompt *">
                  <Textarea
                    placeholder="Ask the model to use tools, e.g. weather or time..."
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
              {loading ? 'Running tools...' : 'Run with Tools'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={
        <>
          <GenerateTextResultPanel
            response={response}
            showToolCalls
            placeholderText="No result yet. Submit a prompt that uses tools to see the output."
          />

          {/* Keep explicit SourcesList for clarity in this demo */}
          <SourcesList sources={sources} />
        </>
      }
    />
  );
}
