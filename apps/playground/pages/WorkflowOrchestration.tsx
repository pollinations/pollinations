'use client';

import { ErrorAlert } from '@/components/ErrorAlert';
import { ModelSelector } from '@/components/ModelSelector';
import { useTextModels } from '@/components/ModelsProvider';
import { PageHeader } from '@/components/PageHeader';
import { usePollinationsApiKey } from '@/components/PollinationsApiKeyProvider';
import { TwoPaneView } from '@/components/TwoPaneView';
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task';
import { SourcesList } from '@/components/text-generation/SourcesList';
import { TextResult } from '@/components/text-generation/TextResult';
import { UsageCard } from '@/components/text-generation/UsageCard';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormFieldItem } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { accumulateUsage } from '@/lib/usage';
import type { LanguageModelV3Source } from '@ai-sdk/provider';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateText, type LanguageModelUsage, Output } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Schema for the workflow plan
const workflowPlanSchema = z.object({
  summary: z
    .string()
    .describe('High-level summary of how the goal will be achieved.'),
  steps: z
    .array(
      z.object({
        id: z
          .string()
          .describe(
            'Short machine-friendly id for the step, e.g. "research" or "draft".',
          ),
        title: z
          .string()
          .describe('Human readable title for this step (3-8 words).'),
        description: z
          .string()
          .describe('1-3 sentences describing what this step will do.'),
      }),
    )
    .min(1)
    .max(8)
    .describe('Ordered list of concrete steps to execute.'),
});

// Form schema
const workflowFormSchema = z.object({
  goal: z.string().min(1, 'Goal is required'),
  model: z.string(),
});

type WorkflowFormValues = z.infer<typeof workflowFormSchema>;

type WorkflowStep = z.infer<typeof workflowPlanSchema>['steps'][number] & {
  status: 'pending' | 'in-progress' | 'complete' | 'error';
  result?: string;
};

export default function WorkflowOrchestration() {
  const { apiKey } = usePollinationsApiKey();
  const availableModels = useTextModels();

  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>('');
  const [usage, setUsage] = useState<LanguageModelUsage | null>(null);
  const [sources, setSources] = useState<LanguageModelV3Source[]>([]);

  const resultRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: {
      goal: 'Create a short blog post about the latest trends in AI.',
      model: 'gemini-fast',
    },
  });

  const onSubmit = async (data: WorkflowFormValues) => {
    setRunning(true);
    setError('');
    setSteps([]);
    setSummary('');
    setUsage(null);
    setSources([]);

    try {
      const pollinations = createPollinations({
        apiKey: apiKey || undefined,
      });
      const model = pollinations(data.model);

      // 1) Ask the model to design a structured workflow plan.
      const planResult = await generateText({
        model,
        output: Output.object({
          name: 'workflowPlan',
          schema: workflowPlanSchema,
        }),
        prompt: [
          `You are an AI project orchestrator.`,
          `Design a small, concrete workflow (3-6 steps) to achieve the following goal:`,
          '',
          `"${data.goal}"`,
          '',
          `Each step should be focused on a single type of work (e.g. research, outline, draft, refine, review).`,
          `Avoid overlapping responsibilities between steps.`,
        ].join('\n'),
      });

      const plan = planResult.output;
      setSummary(plan.summary);
      setUsage((prev) => accumulateUsage(prev, planResult.usage));

      try {
        const planSources = await planResult.sources;
        if (planSources && planSources.length > 0) {
          setSources((prev) => [...prev, ...planSources]);
        }
      } catch {
        // ignore source fetching errors for the plan
      }

      let workflowSteps: WorkflowStep[] = plan.steps.map((step) => ({
        ...step,
        status: 'pending',
      }));
      setSteps(workflowSteps);

      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }

      // 2) Execute each step sequentially, updating the UI as we go.
      for (const step of plan.steps) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === step.id ? { ...s, status: 'in-progress' } : s,
          ),
        );

        const stepResult = await generateText({
          model,
          prompt: [
            `Goal: ${data.goal}`,
            '',
            `You are now executing the workflow step "${step.title}".`,
            '',
            `Step description: ${step.description}`,
            '',
            `Write ONLY the content produced by this step.`,
            `Start directly with the content itself (for example, the blog post text),`,
            `without any introductions like "Here is the result", "Here's a draft",`,
            `and without explanations of what you are doing.`,
            `Do not list the steps again. Do not wrap the entire answer in quotes.`,
          ].join('\n'),
        });

        workflowSteps = workflowSteps.map((s) =>
          s.id === step.id
            ? {
                ...s,
                status: 'complete',
                result: stepResult.text,
              }
            : s,
        );
        setSteps(workflowSteps);
        setUsage((prev) => accumulateUsage(prev, stepResult.usage));

        try {
          const stepSources = await stepResult.sources;
          if (stepSources && stepSources.length > 0) {
            setSources((prev) => [...prev, ...stepSources]);
          }
        } catch {
          // ignore source fetching errors for this step
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Workflow orchestration error:', err);
      setSteps((prev) =>
        prev.map((s) =>
          s.status === 'in-progress' ? { ...s, status: 'error' } : s,
        ),
      );
    } finally {
      setRunning(false);
    }
  };

  const finalResult =
    steps.length > 0 ? (steps[steps.length - 1]?.result ?? '') : '';

  return (
    <TwoPaneView
      resultRef={resultRef}
      leftPane={
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PageHeader
              title="Workflow / Orchestration"
              subtitle="Generate a multi-step plan and execute each step sequentially with Pollinations models."
            />

            <ModelSelector
              form={form}
              name="model"
              models={availableModels}
              disabled={running}
              description="Select a text model to orchestrate the workflow."
            />

            <FormField
              control={form.control}
              name="goal"
              render={({ field }) => (
                <FormFieldItem label="Project goal *">
                  <Textarea
                    placeholder="Describe what you want to achieve..."
                    disabled={running}
                    rows={4}
                    {...field}
                  />
                </FormFieldItem>
              )}
            />

            <Button
              type="submit"
              disabled={running}
              className="w-full sm:w-auto"
            >
              {running ? 'Running workflow...' : 'Generate & Run Workflow'}
            </Button>

            <ErrorAlert message={error} />
          </form>
        </Form>
      }
      rightPane={
        <div className="space-y-4">
          <Plan isStreaming={running} defaultOpen={true}>
            <PlanHeader>
              <div className="space-y-2">
                <PlanTitle>Workflow plan</PlanTitle>
                <PlanDescription>
                  {summary ||
                    'Submit a goal to generate a concrete multi-step plan.'}
                </PlanDescription>
              </div>
              <PlanTrigger />
            </PlanHeader>
            <PlanContent>
              {steps.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No steps yet. Submit a goal to generate a workflow.
                </p>
              ) : (
                <ol className="space-y-4">
                  {steps.map((step, index) => (
                    <li key={step.id}>
                      <Task defaultOpen={false}>
                        <TaskTrigger
                          title={`${index + 1}. ${step.title} ${
                            step.status === 'in-progress'
                              ? '(Running...)'
                              : step.status === 'complete'
                                ? '(Done)'
                                : step.status === 'error'
                                  ? '(Error)'
                                  : '(Pending)'
                          }`}
                        />
                        <TaskContent>
                          <TaskItem>{step.description}</TaskItem>
                          {step.result && (
                            <TaskItem className="text-foreground">
                              {step.result}
                            </TaskItem>
                          )}
                        </TaskContent>
                      </Task>
                    </li>
                  ))}
                </ol>
              )}
            </PlanContent>
            <PlanFooter className="flex justify-between text-xs text-muted-foreground">
              <span>
                Status:{' '}
                {running
                  ? 'Executing steps...'
                  : steps.length
                    ? 'Plan complete'
                    : 'No plan yet'}
              </span>
              {steps.length > 0 && (
                <span>
                  {steps.filter((s) => s.status === 'complete').length} /
                  {steps.length} steps complete
                </span>
              )}
            </PlanFooter>
          </Plan>

          {finalResult && (
            <TextResult
              title="Final result"
              text={finalResult}
              // Only render once a final result exists, so no placeholder needed.
            />
          )}

          {usage && (
            <UsageCard
              usage={usage}
              title="Workflow usage"
              cardTitle="Total token usage"
              showSectionTitle
            />
          )}

          {sources.length > 0 && (
            <SourcesList sources={sources} title="Workflow sources" />
          )}
        </div>
      }
    />
  );
}
