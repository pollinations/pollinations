'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormField,
  FormFieldCheckbox,
  FormFieldItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export const textGenerationFormSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional().nullable(),
  maxOutputTokens: z.number().int().positive().optional().nullable(),
  topP: z.number().min(0).max(1).optional().nullable(),
  seed: z.number().int().optional().nullable(),
  stopSequences: z.string().optional().nullable(),
  frequencyPenalty: z.number().min(-2).max(2).optional().nullable(),
  presencePenalty: z.number().min(-2).max(2).optional().nullable(),
  repetitionPenalty: z.number().min(0).max(2).optional().nullable(),
  modalities: z
    .array(z.enum(['text', 'audio']))
    .optional()
    .nullable(),
  thinkingEnabled: z.boolean().optional().nullable(),
  thinkingBudget: z.number().int().min(0).optional().nullable(),
  reasoningEffort: z
    .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    .optional()
    .nullable(),
  logprobs: z.boolean().optional().nullable(),
  topLogprobs: z.number().int().min(0).max(20).optional().nullable(),
  logitBias: z.string().optional().nullable(),
  user: z.string().optional().nullable(),
});

export type TextGenerationFormValues = z.infer<typeof textGenerationFormSchema>;

export function buildGenerateTextOptions(data: TextGenerationFormValues) {
  // Standard AI SDK options (go to root level)
  const standardOptions: Record<string, any> = {};

  // Pollinations-specific options (go to providerOptions.pollinations)
  const providerOptions: Record<string, any> = {};

  // Standard options
  if (data.temperature !== null && data.temperature !== undefined) {
    standardOptions.temperature = data.temperature;
  }
  if (data.maxOutputTokens !== null && data.maxOutputTokens !== undefined) {
    standardOptions.maxOutputTokens = data.maxOutputTokens;
  }
  if (data.topP !== null && data.topP !== undefined) {
    standardOptions.topP = data.topP;
  }
  if (data.seed !== null && data.seed !== undefined) {
    standardOptions.seed = data.seed;
  }
  if (data.stopSequences) {
    standardOptions.stopSequences = data.stopSequences
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (data.frequencyPenalty !== null && data.frequencyPenalty !== undefined) {
    standardOptions.frequencyPenalty = data.frequencyPenalty;
  }
  if (data.presencePenalty !== null && data.presencePenalty !== undefined) {
    standardOptions.presencePenalty = data.presencePenalty;
  }

  // Provider options (Pollinations-specific)
  if (data.repetitionPenalty !== null && data.repetitionPenalty !== undefined) {
    providerOptions.repetition_penalty = data.repetitionPenalty;
  }
  if (data.modalities && data.modalities.length > 0) {
    providerOptions.modalities = data.modalities;
  }
  if (data.thinkingEnabled !== null && data.thinkingEnabled !== undefined) {
    providerOptions.thinking = data.thinkingEnabled
      ? { type: 'enabled' as const }
      : { type: 'disabled' as const };
  }
  if (data.thinkingBudget !== null && data.thinkingBudget !== undefined) {
    providerOptions.thinking_budget = data.thinkingBudget;
  }
  if (data.reasoningEffort) {
    providerOptions.reasoning_effort = data.reasoningEffort;
  }
  if (data.logprobs !== null && data.logprobs !== undefined) {
    providerOptions.logprobs = data.logprobs;
  }
  if (data.topLogprobs !== null && data.topLogprobs !== undefined) {
    providerOptions.top_logprobs = data.topLogprobs;
  }
  if (data.logitBias) {
    try {
      const parsed = JSON.parse(data.logitBias);
      if (parsed && typeof parsed === 'object') {
        providerOptions.logit_bias = parsed;
      }
    } catch {
      // ignore invalid JSON; do not set logit_bias
    }
  }
  if (data.user) {
    providerOptions.user = data.user;
  }

  return {
    ...standardOptions,
    ...(Object.keys(providerOptions).length > 0 && {
      providerOptions: {
        pollinations: providerOptions,
      },
    }),
  };
}

type TextGenerationOptionsProps = {
  form: UseFormReturn<any>;
  loading?: boolean;
  modalities?: ('text' | 'audio')[] | null;
  thinkingEnabled?: boolean;
};

//TODO: modalities and thinkingEnabled not used
export function TextGenerationOptions({
  form,
  loading = false,
  modalities,
  thinkingEnabled,
}: TextGenerationOptionsProps) {
  const { control } = form;

  return (
    <div>
      <FormLabel className={'mb-2'}>Parameters</FormLabel>
      <Card className={'p-0'}>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="basic-parameters">
            <AccordionTrigger className="px-4">
              Basic Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 py-2">
                <FormField
                  control={control}
                  name="temperature"
                  render={({ field }) => (
                    <FormFieldItem label="Temperature">
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        placeholder="Leave empty for default"
                        disabled={loading}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </FormFieldItem>
                  )}
                />

                <FormField
                  control={control}
                  name="maxOutputTokens"
                  render={({ field }) => (
                    <FormFieldItem label="Max Output Tokens">
                      <Input
                        type="number"
                        placeholder="Leave empty for default"
                        disabled={loading}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </FormFieldItem>
                  )}
                />

                <FormField
                  control={control}
                  name="topP"
                  render={({ field }) => (
                    <FormFieldItem label="Top P">
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        placeholder="Leave empty for default"
                        disabled={loading}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </FormFieldItem>
                  )}
                />

                <FormField
                  control={control}
                  name="seed"
                  render={({ field }) => (
                    <FormFieldItem label="Seed (optional)">
                      <Input
                        type="number"
                        placeholder="Leave empty for random"
                        disabled={loading}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </FormFieldItem>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="advanced-parameters">
            <AccordionTrigger className="px-4">
              Advanced Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-4 py-2">
                {/* 1. Thinking */}
                <div className="flex flex-col gap-6">
                  <FormField
                    control={control}
                    name="thinkingEnabled"
                    render={({ field }) => (
                      <FormFieldCheckbox label="Enable Reasoning (thinking)">
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={(checked) =>
                            field.onChange(Boolean(checked))
                          }
                          disabled={loading}
                        />
                      </FormFieldCheckbox>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={control}
                      name="reasoningEffort"
                      render={({ field }) => (
                        <FormFieldItem label="Reasoning Effort">
                          <Select
                            disabled={loading}
                            value={field.value ?? ''}
                            onValueChange={(value) =>
                              field.onChange(value || null)
                            }
                          >
                            <SelectTrigger className={'w-full'}>
                              <SelectValue placeholder="Default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="minimal">Minimal</SelectItem>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="xhigh">Extra High</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormFieldItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="thinkingBudget"
                      render={({ field }) => (
                        <FormFieldItem label="Thinking Budget (tokens)">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Leave empty for default"
                            disabled={loading}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormFieldItem>
                      )}
                    />
                  </div>
                </div>

                {/* 2. Sequence/Penalties */}
                <div className="py-4 flex flex-col gap-4">
                  <FormField
                    control={control}
                    name="stopSequences"
                    render={({ field }) => (
                      <FormFieldItem label="Stop Sequences (comma-separated)">
                        <Input
                          placeholder="stop1, stop2"
                          disabled={loading}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormFieldItem>
                    )}
                  />

                  {/* Penalties grouped in a single grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormField
                      control={control}
                      name="frequencyPenalty"
                      render={({ field }) => (
                        <FormFieldItem label="Frequency Penalty">
                          <Input
                            type="number"
                            min={-2}
                            max={2}
                            step={0.1}
                            placeholder="Leave empty for default"
                            disabled={loading}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormFieldItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="presencePenalty"
                      render={({ field }) => (
                        <FormFieldItem label="Presence Penalty">
                          <Input
                            type="number"
                            min={-2}
                            max={2}
                            step={0.1}
                            placeholder="Leave empty for default"
                            disabled={loading}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormFieldItem>
                      )}
                    />

                    <FormField
                      control={control}
                      name="repetitionPenalty"
                      render={({ field }) => (
                        <FormFieldItem label="Repetition Penalty">
                          <Input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            placeholder="Leave empty for default"
                            disabled={loading}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormFieldItem>
                      )}
                    />
                  </div>
                </div>

                {/* 3. Logprobs */}
                <div className="flex flex-col gap-6">
                  <FormField
                    control={control}
                    name="logprobs"
                    render={({ field }) => (
                      <FormFieldCheckbox label="Return Logprobs">
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={(checked) =>
                            field.onChange(Boolean(checked))
                          }
                          disabled={loading}
                        />
                      </FormFieldCheckbox>
                    )}
                  />

                  <FormField
                    control={control}
                    name="topLogprobs"
                    render={({ field }) => (
                      <FormFieldItem label="Top Logprobs (0-20)">
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          placeholder="Leave empty for default"
                          disabled={loading}
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </FormFieldItem>
                    )}
                  />
                </div>

                {/* 4. Rest */}
                <div className="py-4 flex flex-col gap-4">
                  <FormField
                    control={control}
                    name="logitBias"
                    render={({ field }) => (
                      <FormFieldItem label="Logit Bias (JSON)">
                        <Textarea
                          placeholder='e.g. {"50256": -100}'
                          disabled={loading}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormFieldItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="user"
                    render={({ field }) => (
                      <FormFieldItem label="User Identifier">
                        <Input
                          placeholder="Optional user id for analytics"
                          disabled={loading}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormFieldItem>
                    )}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
