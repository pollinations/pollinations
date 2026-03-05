'use client';

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TextResult } from '@/components/text-generation/TextResult';
import { TwoPaneView } from '@/components/TwoPaneView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  generateText,
  hasToolCall,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const exampleQueries = [
  'My internet connection keeps dropping. Can you help?',
  'I need help talking to chatGPT',
  'Where can I find my receipt?',
  'What are your business hours?',
  'I forgot my password and cannot log in to my account',
  'How do I cancel my subscription?',
  'My payment was charged twice, can you refund one?',
  'The app crashes every time I try to upload a file',
  'I want to upgrade my plan to premium',
  'How do I change my email address?',
  'The website is loading very slowly for me',
  'I received an error message when trying to checkout',
];

const customerSupportFormSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  model: z.string(),
});

type CustomerSupportFormValues = z.infer<typeof customerSupportFormSchema>;

type SupportState = {
  query: string;
  category?: 'Technical' | 'Billing' | 'General';
  sentiment?: 'Positive' | 'Neutral' | 'Negative';
  response?: string;
  escalated?: boolean;
};

type TimelineItem = {
  id: string;
  step: number;
  timestamp: number;
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  status: 'running' | 'completed' | 'error';
};

export default function AgenticToolCalling() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [supportState, setSupportState] = useState<SupportState | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const { apiKey } = usePollinationsApiKey();
  const availableTextModels = useTextModels();

  const randomQuery = useMemo(
    () => exampleQueries[Math.floor(Math.random() * exampleQueries.length)],
    [],
  );

  const form = useForm<CustomerSupportFormValues>({
    resolver: zodResolver(customerSupportFormSchema),
    defaultValues: {
      query: randomQuery,
      model:
        availableTextModels.find((m) => m.id === 'gemini-fast')?.id ||
        availableTextModels[0]?.id ||
        '',
    },
  });

  const addTimelineItem = (
    toolName: string,
    step: number,
    input?: unknown,
  ): string => {
    const id = `timeline-${Date.now()}-${Math.random()}`;
    const item: TimelineItem = {
      id,
      step,
      timestamp: Date.now(),
      toolName,
      input,
      status: 'running',
    };
    setTimeline((prev) => [...prev, item]);
    return id;
  };

  const updateTimelineItem = (
    id: string,
    output?: unknown,
    error?: string,
    status: 'running' | 'completed' | 'error' = 'completed',
  ) => {
    setTimeline((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, output, error, status } : item,
      ),
    );
  };

  const onSubmit = async (data: CustomerSupportFormValues) => {
    setIsRunning(true);
    setError('');
    setTimeline([]);
    setSupportState(null);

    abortControllerRef.current = new AbortController();

    // Scroll to results
    if (resultRef.current) {
      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const languageModel = pollinations(data.model);

      const state: SupportState = {
        query: data.query,
      };

      // ============================================================
      // Create Tools
      // ============================================================

      const categorizeTool = tool({
        description:
          'Categorize the customer query into one of: Technical, Billing, or General.',
        inputSchema: z.object({
          query: z.string().describe('The customer query to categorize'),
        }),
        execute: async ({ query }: { query: string }) => {
          const categorizeId = addTimelineItem('Categorize', 1, { query });
          try {
            const result = await generateText({
              model: languageModel,
              prompt: `Categorize the following customer query into one of these categories: Technical, Billing, General. Respond with only the category name (Technical, Billing, or General). Query: ${query}`,
              abortSignal: abortControllerRef.current?.signal,
            });

            const category = result.text.trim() as
              | 'Technical'
              | 'Billing'
              | 'General';
            state.category = category;
            updateTimelineItem(
              categorizeId,
              { category },
              undefined,
              'completed',
            );
            return { category };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'Categorization failed';
            updateTimelineItem(categorizeId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      const analyzeSentimentTool = tool({
        description:
          'Analyze the sentiment of the customer query. Respond with: Positive, Neutral, or Negative.',
        inputSchema: z.object({
          query: z.string().describe('The customer query to analyze'),
        }),
        execute: async ({ query }: { query: string }) => {
          const sentimentId = addTimelineItem('Analyze Sentiment', 2, {
            query,
          });
          try {
            const result = await generateText({
              model: languageModel,
              prompt: `Analyze the sentiment of the following customer query. Respond with only one word: Positive, Neutral, or Negative. Query: ${query}`,
              abortSignal: abortControllerRef.current?.signal,
            });

            const sentiment = result.text.trim() as
              | 'Positive'
              | 'Neutral'
              | 'Negative';
            state.sentiment = sentiment;
            updateTimelineItem(
              sentimentId,
              { sentiment },
              undefined,
              'completed',
            );
            return { sentiment };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'Sentiment analysis failed';
            updateTimelineItem(sentimentId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      const handleTechnicalTool = tool({
        description:
          'Provide a technical support response to the customer query.',
        inputSchema: z.object({
          query: z.string().describe('The technical support query'),
        }),
        execute: async ({ query }: { query: string }) => {
          const technicalId = addTimelineItem('Handle Technical', 3, { query });
          try {
            const result = await generateText({
              model: languageModel,
              prompt: `You are a customer support agent. Provide a professional, helpful technical support response to the following customer query. Be specific, actionable, and helpful. Do not mention that you are an AI. Respond as if you are a real customer support representative.

Customer query: ${query}

Provide your response:`,
              abortSignal: abortControllerRef.current?.signal,
            });

            state.response = result.text;
            updateTimelineItem(
              technicalId,
              { response: result.text },
              undefined,
              'completed',
            );
            return { response: result.text };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'Technical handling failed';
            updateTimelineItem(technicalId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      const handleBillingTool = tool({
        description:
          'Provide a billing support response to the customer query.',
        inputSchema: z.object({
          query: z.string().describe('The billing support query'),
        }),
        execute: async ({ query }: { query: string }) => {
          const billingId = addTimelineItem('Handle Billing', 3, { query });
          try {
            const result = await generateText({
              model: languageModel,
              prompt: `You are a customer support agent. Provide a professional, helpful billing support response to the following customer query. Be specific, actionable, and helpful. Do not mention that you are an AI. Respond as if you are a real customer support representative.

Customer query: ${query}

Provide your response:`,
              abortSignal: abortControllerRef.current?.signal,
            });

            state.response = result.text;
            updateTimelineItem(
              billingId,
              { response: result.text },
              undefined,
              'completed',
            );
            return { response: result.text };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'Billing handling failed';
            updateTimelineItem(billingId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      const handleGeneralTool = tool({
        description:
          'Provide a general support response to the customer query.',
        inputSchema: z.object({
          query: z.string().describe('The general support query'),
        }),
        execute: async ({ query }: { query: string }) => {
          const generalId = addTimelineItem('Handle General', 3, { query });
          try {
            const result = await generateText({
              model: languageModel,
              prompt: `You are a customer support agent. Provide a professional, helpful general support response to the following customer query. Be specific, actionable, and helpful. Do not mention that you are an AI. Respond as if you are a real customer support representative.

Customer query: ${query}

Provide your response:`,
              abortSignal: abortControllerRef.current?.signal,
            });

            state.response = result.text;
            updateTimelineItem(
              generalId,
              { response: result.text },
              undefined,
              'completed',
            );
            return { response: result.text };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'General handling failed';
            updateTimelineItem(generalId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      const escalateTool = tool({
        description:
          'Escalate the query to a human agent. Use this when sentiment is negative.',
        inputSchema: z.object({
          query: z.string().describe('The query to escalate'),
          reason: z.string().describe('Reason for escalation'),
        }),
        execute: async ({
          query,
          reason,
        }: {
          query: string;
          reason: string;
        }) => {
          const escalateId = addTimelineItem('Escalate', 3, { query, reason });
          try {
            state.escalated = true;
            state.response = `Thank you for contacting us. We understand your concern and want to ensure you receive the best possible assistance. Your query has been escalated to our specialized support team, and someone will contact you soon to help resolve this matter. We appreciate your patience.`;
            updateTimelineItem(
              escalateId,
              { escalated: true, response: state.response },
              undefined,
              'completed',
            );
            return { escalated: true, response: state.response };
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : 'Escalation failed';
            updateTimelineItem(escalateId, undefined, errorMsg, 'error');
            throw err;
          }
        },
      });

      // ============================================================
      // Create Customer Support Agent
      // ============================================================

      const supportAgent = new ToolLoopAgent({
        model: languageModel,
        instructions: `You are a customer support agent. Your workflow is:
1. First, categorize the customer query using the categorize tool
2. Then, analyze the sentiment using the analyzeSentiment tool
3. Based on category and sentiment:
   - If sentiment is Negative: escalate the query using the escalate tool
   - If category is Technical: use handleTechnical tool
   - If category is Billing: use handleBilling tool
   - If category is General: use handleGeneral tool

Always follow this workflow in order.`,
        tools: {
          categorize: categorizeTool,
          analyzeSentiment: analyzeSentimentTool,
          handleTechnical: handleTechnicalTool,
          handleBilling: handleBillingTool,
          handleGeneral: handleGeneralTool,
          escalate: escalateTool,
        },
        stopWhen: [
          stepCountIs(10),
          hasToolCall('handleTechnical'),
          hasToolCall('handleBilling'),
          hasToolCall('handleGeneral'),
          hasToolCall('escalate'),
        ],
        toolChoice: 'required',
      });

      const result = await supportAgent.generate({
        prompt: `Process this customer query: ${data.query}`,
        abortSignal: abortControllerRef.current.signal,
      });

      setSupportState(state);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation was cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Customer support agent error:', err);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <TwoPaneView
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Agentic Tool-Calling"
              subtitle="Intelligent customer support agent that categorizes queries, analyzes sentiment, and provides appropriate responses or escalates when needed."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableTextModels}
              disabled={isRunning}
              description="Language model for the support agent."
            />

            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormFieldItem label="Customer Query *">
                  <Textarea
                    {...field}
                    placeholder="Enter customer query..."
                    disabled={isRunning}
                    rows={6}
                  />
                </FormFieldItem>
              )}
            />

            <ErrorAlert message={error} />

            <div className="flex gap-2">
              <Button type="submit" disabled={isRunning}>
                {isRunning ? 'Processing...' : 'Process Query'}
              </Button>
              {isRunning && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleStop}
                >
                  Stop
                </Button>
              )}
            </div>
          </form>
        </Form>
      }
      rightPane={
        <div ref={resultRef} className="space-y-4">
          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Workflow Timeline</h3>
              <div className="space-y-2">
                {timeline.map((item) => (
                  <Tool key={item.id} defaultOpen={false}>
                    <ToolHeader
                      title={item.toolName}
                      type={`tool-${item.toolName}` as any}
                      state={
                        item.status === 'error'
                          ? 'output-error'
                          : item.status === 'completed'
                            ? 'output-available'
                            : 'input-available'
                      }
                    />
                    <ToolContent>
                      {item.input != null && (
                        <ToolInput input={item.input as any} />
                      )}
                      {(item.output || item.error) && (
                        <ToolOutput
                          output={item.output as any}
                          errorText={item.error}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                ))}
              </div>
            </div>
          )}

          {/* Support State Results */}
          {supportState && (
            <div className="space-y-4">
              {(supportState.category || supportState.sentiment) && (
                <Card className={'gap-4'}>
                  <CardHeader>
                    <CardTitle>Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {supportState.category && (
                        <Badge variant="secondary">
                          {supportState.category}
                        </Badge>
                      )}
                      {supportState.sentiment && (
                        <Badge
                          variant={
                            supportState.sentiment === 'Positive'
                              ? 'default'
                              : supportState.sentiment === 'Negative'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {supportState.sentiment}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {supportState.escalated && (
                <Card className="border-orange-500 gap-2">
                  <CardHeader>
                    <CardTitle className="text-orange-600">
                      ⚠️ Escalated
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-orange-600">
                      This query has been escalated to a human agent.
                    </p>
                  </CardContent>
                </Card>
              )}

              <TextResult
                title="Response"
                text={supportState.response}
                placeholder="No response yet."
              />
            </div>
          )}
        </div>
      }
    />
  );
}
