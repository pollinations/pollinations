'use client';

import { useTextModels } from '@/components/ModelsProvider';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import * as React from 'react';

interface ChatModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ChatModelSelector({
  value,
  onValueChange,
  disabled = false,
}: ChatModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const models = useTextModels();

  const selectedModel = models.find((model) => model.id === value);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 gap-1.5 px-2"
        >
          {selectedModel ? (
            <>
              <span className="text-xs font-medium">{selectedModel.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">
              Select model...
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 max-w-[600px]">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {models.map((model) => (
                <CommandItem
                  key={model.id}
                  value={`${model.id} ${model.name} ${model.description}`}
                  onSelect={() => {
                    onValueChange(model.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      value === model.id ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <div className="flex flex-col gap-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {model.featuresTitle && (
                        <span className="text-xs text-muted-foreground">
                          {model.featuresTitle}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {model.descriptionShort || model.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
