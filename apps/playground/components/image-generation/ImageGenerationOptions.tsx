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

const SIZE_OPTIONS = [
  { value: '256x256', label: '256x256' },
  { value: '512x512', label: '512x512' },
  { value: '1024x1024', label: '1024x1024' },
  { value: '1792x1024', label: '1792x1024 (16:9)' },
  { value: '1024x1792', label: '1024x1792 (9:16)' },
  { value: '2048x2048', label: '2048x2048 (2K)' },
  { value: '2048x1024', label: '2048x1024 (2K 16:9)' },
  { value: '1024x2048', label: '1024x2048 (2K 9:16)' },
] as const;

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'hd', label: 'HD' },
] as const;

// Form schema with all available parameters
export const imageGenerationFormSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string(),
  size: z.string().optional().nullable(),
  seed: z.number().int().optional().nullable(),
  // Common options
  negativePrompt: z.string().optional().nullable(),
  safe: z.boolean().optional().nullable(),
  nologo: z.boolean().optional().nullable(),
  enhance: z.boolean().optional().nullable(),
  private: z.boolean().optional().nullable(),
  // GPT Image options
  quality: z.enum(['low', 'medium', 'high', 'hd']).optional().nullable(),
  transparent: z.boolean().optional().nullable(),
  // Reference image
  image: z.string().optional().nullable(),
});

export type ImageGenerationFormValues = z.infer<
  typeof imageGenerationFormSchema
>;

/**
 * Checks if the model is a GPT Image model.
 */
export function isGptImageModel(modelId: string): boolean {
  return modelId === 'gptimage' || modelId === 'gptimage-large';
}

/**
 * Converts form values to generateImage options format.
 * Returns an object that can be spread into generateImage options (excluding model and prompt).
 */
export function buildGenerateImageOptions(
  data: ImageGenerationFormValues,
  isGptImage: boolean,
) {
  // Build provider options
  const providerOptions: Record<string, string | number | boolean> = {};

  if (data.negativePrompt) {
    providerOptions.negative_prompt = data.negativePrompt;
  }
  if (data.safe !== null && data.safe !== undefined) {
    providerOptions.safe = data.safe;
  }
  if (data.nologo !== null && data.nologo !== undefined) {
    providerOptions.nologo = data.nologo;
  }
  if (data.enhance !== null && data.enhance !== undefined) {
    providerOptions.enhance = data.enhance;
  }
  if (data.private !== null && data.private !== undefined) {
    providerOptions.private = data.private;
  }

  // GPT Image specific options
  if (isGptImage) {
    if (data.quality) {
      providerOptions.quality = data.quality;
    }
    if (data.transparent !== null && data.transparent !== undefined) {
      providerOptions.transparent = data.transparent;
    }
  }

  // Reference image (validate URL if provided)
  if (data.image && data.image.trim() !== '') {
    try {
      new URL(data.image); // Validate URL
      providerOptions.image = data.image;
    } catch {
      // Invalid URL, skip it
    }
  }

  // Build generate options (excluding model and prompt)
  const generateOptions: Record<string, any> = {};

  if (data.size) {
    generateOptions.size = data.size as any;
  }
  if (data.seed !== null && data.seed !== undefined) {
    generateOptions.seed = data.seed;
  }
  if (Object.keys(providerOptions).length > 0) {
    generateOptions.providerOptions = {
      pollinations: providerOptions as any,
    };
  }

  return generateOptions;
}

type ImageGenerationOptionsProps = {
  form: UseFormReturn<any>;
  loading?: boolean;
  isGptImage?: boolean;
};

export function ImageGenerationOptions({
  form,
  loading = false,
  isGptImage = false,
}: ImageGenerationOptionsProps) {
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
                  name="size"
                  render={({ field }) => (
                    <FormFieldItem label="Size">
                      <Select
                        value={field.value || ''}
                        onValueChange={(value) => field.onChange(value || null)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormFieldItem>
                  )}
                />

                <FormField
                  control={control}
                  name="seed"
                  render={({ field }) => (
                    <FormFieldItem label="Seed (optional, -1 for random)">
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

          <AccordionItem value="common-options">
            <AccordionTrigger className="px-4">Common Options</AccordionTrigger>
            <AccordionContent className="px-4">
              <div className="space-y-4 py-2">
                <FormField
                  control={control}
                  name="negativePrompt"
                  render={({ field }) => (
                    <FormFieldItem label="Negative Prompt">
                      <Textarea
                        placeholder="What to avoid in the generated image"
                        disabled={loading}
                        rows={3}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormFieldItem>
                  )}
                />

                <FormField
                  control={control}
                  name="safe"
                  render={({ field }) => (
                    <FormFieldCheckbox label="Enable Safety Filters">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormFieldCheckbox>
                  )}
                />

                <FormField
                  control={control}
                  name="nologo"
                  render={({ field }) => (
                    <FormFieldCheckbox label="Remove Logo">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormFieldCheckbox>
                  )}
                />

                <FormField
                  control={control}
                  name="enhance"
                  render={({ field }) => (
                    <FormFieldCheckbox label="Enhance Quality">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormFieldCheckbox>
                  )}
                />

                <FormField
                  control={control}
                  name="private"
                  render={({ field }) => (
                    <FormFieldCheckbox label="Private (not in public feed)">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormFieldCheckbox>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {isGptImage && (
            <AccordionItem value="gpt-image-options">
              <AccordionTrigger className="px-4">
                GPT Image Options
              </AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4">
                  <FormField
                    control={control}
                    name="quality"
                    render={({ field }) => (
                      <FormFieldItem label="Quality">
                        <Select
                          value={field.value || ''}
                          onValueChange={(value) =>
                            field.onChange(value || null)
                          }
                          disabled={loading}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select quality" />
                          </SelectTrigger>
                          <SelectContent>
                            {QUALITY_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormFieldItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="transparent"
                    render={({ field }) => (
                      <FormFieldCheckbox label="Transparent Background">
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                          disabled={loading}
                        />
                      </FormFieldCheckbox>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="reference-image">
            <AccordionTrigger className="px-4">
              Reference Image
            </AccordionTrigger>
            <AccordionContent className={'px-4 pt-2 pb-6'}>
              <FormField
                control={control}
                name="image"
                render={({ field }) => (
                  <FormFieldItem
                    label="Reference Image URL"
                    description="URL to a reference image. Supports multiple images (comma-separated)."
                  >
                    <Input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      disabled={loading}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormFieldItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
