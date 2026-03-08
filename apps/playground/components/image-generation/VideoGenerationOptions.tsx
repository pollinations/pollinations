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
import { type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '1:1', label: '1:1 (Square)' },
] as const;

const DURATION_OPTIONS = [
  { value: '2', label: '2 seconds' },
  { value: '4', label: '4 seconds' },
  { value: '6', label: '6 seconds' },
  { value: '8', label: '8 seconds' },
  { value: '10', label: '10 seconds' },
] as const;

export const videoGenerationFormSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  model: z.string(),
  aspectRatio: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  seed: z.number().int().optional().nullable(),
  image: z.string().optional().nullable(),
  audio: z.boolean().optional().nullable(),
});

export type VideoGenerationFormValues = z.infer<
  typeof videoGenerationFormSchema
>;

export function buildGenerateVideoOptions(data: VideoGenerationFormValues) {
  const providerOptions: Record<string, string | number | boolean> = {};

  if (data.aspectRatio) {
    providerOptions.aspect_ratio = data.aspectRatio;
  }
  if (data.duration) {
    providerOptions.duration = Number(data.duration);
  }
  if (data.image) {
    try {
      new URL(data.image);
      providerOptions.image = data.image;
    } catch {
      // Invalid URL, skip it
    }
  }
  if (data.audio !== null && data.audio !== undefined) {
    providerOptions.audio = data.audio;
  }

  const generateOptions: Record<string, any> = {};

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

type VideoGenerationOptionsProps = {
  form: UseFormReturn<any>;
  loading?: boolean;
  selectedModel?: string;
};

export function VideoGenerationOptions({
  form,
  loading = false,
  selectedModel,
}: VideoGenerationOptionsProps) {
  const { control } = form;
  const isVeo = selectedModel === 'veo';

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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4">
                <FormField
                  control={control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <FormFieldItem label="Aspect Ratio">
                      <Select
                        value={field.value || ''}
                        onValueChange={(value) => field.onChange(value || null)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select aspect ratio" />
                        </SelectTrigger>
                        <SelectContent>
                          {ASPECT_RATIO_OPTIONS.map((option) => (
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
                  name="duration"
                  render={({ field }) => (
                    <FormFieldItem label="Duration">
                      <Select
                        value={field.value || ''}
                        onValueChange={(value) => field.onChange(value || null)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map((option) => (
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

          {isVeo && (
            <AccordionItem value="veo-options">
              <AccordionTrigger className="px-4">Veo Options</AccordionTrigger>
              <AccordionContent className="px-4">
                <div className="space-y-4 pt-4">
                  <FormField
                    control={control}
                    name="audio"
                    render={({ field }) => (
                      <FormFieldCheckbox label="Enable Audio">
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
            <AccordionContent className={'px-4 pt-4'}>
              <FormField
                control={control}
                name="image"
                render={({ field }) => (
                  <FormFieldItem
                    label="Reference Image URL"
                    description="URL to a reference image for image-to-video generation."
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
