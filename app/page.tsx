'use client';

import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/theme-toggle';
// @ts-expect-error todo: interfaces
import { PollinationsText, PollinationsImage, PollinationsMarkdown } from '@pollinations/react';
import { debounce } from 'lodash';

// Constants
const DEBOUNCE_DELAY = 1;
const DEFAULT_SEED = 42;
const DEFAULT_IMAGE_WIDTH = 800;
const DEFAULT_IMAGE_HEIGHT = 600;

// Types
type ModelType = 'mistral' | 'openai';

interface ComponentConfig {
  name: string;
  description: string;
  defaultPrompt: string;
  generateCode: (config: ComponentState) => string;
  preview: (config: ComponentState) => React.ReactNode;
}

interface ComponentState {
  prompt: string;
  model: ModelType;
  seed: number;
  width?: number;
  height?: number;
}

// Component configurations
const pollinationComponents: ComponentConfig[] = [
  {
    name: 'PollinationsText',
    description: "Generates and displays plain text using Pollination's API.",
    defaultPrompt: 'Describe the process of pollination',
    generateCode: ({ prompt, model, seed }) =>
      `<PollinationsText seed={${seed}} model="${model}" systemPrompt="You are a helpful assistant.">${prompt}</PollinationsText>`,
    preview: ({ prompt, model, seed }) => (
      <pre>
        <PollinationsText seed={seed} model={model} systemPrompt="You are a helpful assistant.">
          {prompt}
        </PollinationsText>
      </pre>
    ),
  },
  {
    name: 'PollinationsImage',
    description: "Generates and displays images using Pollination's API.",
    defaultPrompt: 'pollination',
    generateCode: ({ prompt, seed, width, height }) =>
      `<PollinationsImage prompt="${prompt}" width={${width}} height={${height}} seed={${seed}} />`,
    preview: ({ prompt, seed, width, height }) => (
      <PollinationsImage prompt={prompt} width={width} height={height} seed={seed} />
    ),
  },
  {
    name: 'PollinationsMarkdown',
    description: "Generates and displays markdown text using Pollination's API.",
    defaultPrompt: 'Create a markdown guide on pollination techniques',
    generateCode: ({ prompt, model, seed }) =>
      `<PollinationsMarkdown seed={${seed}} model="${model}" systemPrompt="You are a technical writer.">${prompt}</PollinationsMarkdown>`,
    preview: ({ prompt, model, seed }) => (
      <PollinationsMarkdown seed={seed} model={model} systemPrompt="You are a technical writer.">
        {prompt}
      </PollinationsMarkdown>
    ),
  },
];

export default function PollinationsComponentDocs() {
  const [componentStates, setComponentStates] = useState<ComponentState[]>(
    pollinationComponents.map((component) => ({
      prompt: component.defaultPrompt,
      model: 'openai',
      seed: DEFAULT_SEED,
      width: DEFAULT_IMAGE_WIDTH,
      height: DEFAULT_IMAGE_HEIGHT,
    }))
  );
  const [loading, setLoading] = useState<boolean[]>(pollinationComponents.map(() => false));

  // Debounced function to update component states
  const debouncedSetComponentState = useCallback(
    debounce((index: number, newState: Partial<ComponentState>) => {
      setComponentStates((prevStates) => {
        const updatedStates = [...prevStates];
        updatedStates[index] = { ...updatedStates[index], ...newState };
        return updatedStates;
      });
      setLoading((prevLoading) => {
        const newLoading = [...prevLoading];
        newLoading[index] = false;
        return newLoading;
      });
    }, DEBOUNCE_DELAY),
    []
  );

  // Handle input change
  const handleInputChange = (index: number, field: keyof ComponentState, value: string | number) => {
    setLoading((prevLoading) => {
      const newLoading = [...prevLoading];
      newLoading[index] = true;
      return newLoading;
    });
    debouncedSetComponentState(index, { [field]: value });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-4 space-y-8">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-center">
            🌸 Pollinations Generative React Hooks & Components ^1.4.5 🌸
          </h1>
          <ThemeToggle />
        </header>
        {pollinationComponents.map((component, index) => (
          <section key={component.name} className="border border-border rounded-lg p-6 space-y-4 bg-card text-card-foreground">
            <h2 className="text-2xl font-semibold">{component.name}</h2>
            <p className="text-muted-foreground">{component.description}</p>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-grow">
                <label htmlFor={`prompt-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                  Prompt:
                </label>
                <Input
                  id={`prompt-${index}`}
                  value={componentStates[index].prompt}
                  onChange={(e) => handleInputChange(index, 'prompt', e.target.value)}
                  placeholder={`Enter prompt for ${component.name}`}
                  className="w-full bg-input text-input-foreground"
                />
              </div>
              {component.name !== 'PollinationsImage' && (
                <div className="w-full md:w-48">
                  <label htmlFor={`model-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                    Model:
                  </label>
                  <Select
                    value={componentStates[index].model}
                    onValueChange={(value: ModelType) => handleInputChange(index, 'model', value)}
                  >
                    <SelectTrigger id={`model-${index}`} className="bg-input text-input-foreground">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mistral">Mistral</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="w-full md:w-32">
                <label htmlFor={`seed-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                  Seed:
                </label>
                <Input
                  id={`seed-${index}`}
                  type="number"
                  value={componentStates[index].seed}
                  onChange={(e) => handleInputChange(index, 'seed', parseInt(e.target.value, 10))}
                  placeholder="Seed"
                  className="bg-input text-input-foreground"
                />
              </div>
              {component.name === 'PollinationsImage' && (
                <>
                  <div className="w-full md:w-32">
                    <label htmlFor={`width-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                      Width:
                    </label>
                    <Input
                      id={`width-${index}`}
                      type="number"
                      value={componentStates[index].width}
                      onChange={(e) => handleInputChange(index, 'width', parseInt(e.target.value, 10))}
                      placeholder="Width"
                      className="bg-input text-input-foreground"
                    />
                  </div>
                  <div className="w-full md:w-32">
                    <label htmlFor={`height-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                      Height:
                    </label>
                    <Input
                      id={`height-${index}`}
                      type="number"
                      value={componentStates[index].height}
                      onChange={(e) => handleInputChange(index, 'height', parseInt(e.target.value, 10))}
                      placeholder="Height"
                      className="bg-input text-input-foreground"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Generated Code:</h3>
              <pre className="bg-muted text-muted-foreground p-4 rounded-md overflow-x-auto max-h-60">
                <code>{component.generateCode(componentStates[index])}</code>
              </pre>
            </div>
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Preview:</h3>
              <div className="border border-border p-4 rounded-md overflow-x-auto bg-card">
                {loading[index] ? (
                  <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-4 py-1">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded"></div>
                        <div className="h-4 bg-muted rounded w-5/6"></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  component.preview(componentStates[index])
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      <footer className="bg-muted text-muted-foreground py-4 mt-8">
        <div className="container mx-auto text-center">
          Made with ❤️ by{' '}
          <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Pollinations.AI team
          </a>
        </div>
      </footer>
    </div>
  );
}