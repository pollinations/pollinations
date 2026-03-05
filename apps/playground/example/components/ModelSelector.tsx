'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UseFormReturn } from 'react-hook-form';
import { FEATURE_EMOJI } from './ModelsProvider';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  descriptionShort?: string;
  category?: string;
  features?: string[];
  featuresTitle?: string;
}

type ModelSelectorProps = {
  form: UseFormReturn<any>;
  name: string;
  models: readonly ModelOption[];
  disabled?: boolean;
  description?: string;
  onValueChange?: (value: string) => void;
};

export function ModelSelector({
  form,
  name,
  models,
  disabled = false,
  description,
  onValueChange,
}: ModelSelectorProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const selectedModel = models.find((model) => model.id === field.value);

        return (
          <FormItem>
            <FormLabel>Model {description && `- ${description}`}</FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                onValueChange?.(value);
              }}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger
                  style={{
                    height: 'auto',
                    width: '100%',
                  }}
                >
                  <SelectValue
                    className={'w-full h-auto'}
                    placeholder="Select a model"
                  >
                    {selectedModel ? (
                      <Alert className={'flex-1 border-0 p-0 text-start'}>
                        <AlertTitle>{selectedModel.description}</AlertTitle>
                        <AlertDescription>
                          {selectedModel.features &&
                            selectedModel.features.length > 0 && (
                              <div className="text-xs text-muted-foreground space-y-1">
                                <span className="font-semibold">
                                  Features:{' '}
                                </span>
                                {selectedModel.features.map((feature) => (
                                  <span
                                    key={feature}
                                    className="inline-flex items-center gap-1 ps-1"
                                  >
                                    <span aria-hidden="true">
                                      {FEATURE_EMOJI[feature] ?? '•'}
                                    </span>
                                    <span>{feature}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div>Select a model</div>
                    )}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                    textValue={model.name}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1">
                        <b>{model.name}</b>
                        {model.featuresTitle && (
                          <span aria-hidden="true">{model.featuresTitle}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {model.descriptionShort ?? model.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
