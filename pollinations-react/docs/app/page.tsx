'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
// @ts-expect-error todo: interfaces
import { PollinationsText, PollinationsImage, PollinationsMarkdown, usePollinationsImage, usePollinationsText, usePollinationsChat } from '@pollinations/react';
import { Copy, Github, Send } from 'lucide-react';
import Markdown from 'react-markdown';
import { useDebounce } from "@uidotdev/usehooks";

// Constants
const DEFAULT_SEED = 42;
const DEFAULT_IMAGE_WIDTH = 800;
const DEFAULT_IMAGE_HEIGHT = 600;

// Default models as fallback
const DEFAULT_TEXT_MODELS = ['openai', 'mistral', 'llama'];
const DEFAULT_IMAGE_MODELS = ['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'any-dark', 'turbo'];

// Types
type ModelType = string;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

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

interface ImageHookConfig {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  model: string;
  nologo: boolean;
  enhance: boolean;
}

interface TextHookConfig {
  prompt: string;
  seed: number;
  model: string;
  systemPrompt: string;
}

interface ChatHookConfig {
  initialMessage: string;
  seed: number;
  jsonMode: boolean;
  model: string;
}

// Component configurations
const pollinationComponents: ComponentConfig[] = [
  {
    name: 'PollinationsText',
    description: "Generates and displays plain text using Pollination's API.",
    defaultPrompt: 'Describe the process of hand-pollination',
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
    defaultPrompt: 'A detailed illustration of pollination',
    generateCode: ({ prompt, model, seed, width, height }) =>
      `<PollinationsImage prompt="${prompt}" width={${width}} height={${height}} seed={${seed}} model="${model}" />`,
    preview: ({ prompt, model, seed, width, height }) => (
      <PollinationsImage prompt={prompt} width={width} height={height} seed={seed} model={model} />
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

const PollinationsDynamicExamples: React.FC = () => {
  // State for text generation
  const [textInput, setTextInput] = useState<string>('Write a short haiku about the ocean');
  const [textPrompt, setTextPrompt] = useState<string>('');
  const [textModel, setTextModel] = useState<ModelType>('openai');

  // State for image generation
  const [imageInput, setImageInput] = useState<string>('A serene beach at sunset');
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [imageModel, setImageModel] = useState<ModelType>('flux');

  // State for chat
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessage, setChatMessage] = useState<string>('What can you tell me about pollination?');

  // Generated content
  const generatedText = usePollinationsText(textPrompt, {
    seed: 42,
    model: textModel,
    systemPrompt: 'You are a helpful assistant.',
  });

  const generatedImage = usePollinationsImage(imagePrompt, {
    width: 800,
    height: 600,
    seed: 42,
    model: imageModel,
    nologo: true,
    enhance: false,
  });

  const { sendUserMessage, messages } = usePollinationsChat([
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'assistant', content: chatMessage }
  ], {
    seed: 42,
    jsonMode: false,
    model: 'mistral',
  });

  // Handle sending messages
  const handleSendText = useCallback(() => {
    setTextPrompt(textInput);
  }, [textInput]);

  const handleSendImage = useCallback(() => {
    setImagePrompt(imageInput);
  }, [imageInput]);

  const handleSendChatMessage = useCallback(() => {
    if (chatInput.trim()) {
      sendUserMessage(chatInput);
      setChatInput('');
    }
  }, [chatInput, sendUserMessage]);


  useEffect(() => {
    if (imageInput) {
      setImagePrompt(imageInput);
    }
  }, [imageModel, imageInput]);

  // Handle copying text
  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Text copied to clipboard!');
    });
  }, []);

  return (
    <div className="space-y-12 dark:bg-gray-800">
      <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <h2 className="text-2xl font-semibold">🛠️ PollinationsText Hook</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Dynamically generate text using the <code>usePollinationsText</code> hook.
        </p>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter a prompt for text generation"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); 
                  handleSendText(); 
                }
              }}
              className="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
            />
            <Button onClick={handleSendText} className="bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
          <Select value="openai" onValueChange={(value: ModelType) => setTextModel(value)}>
            <SelectTrigger className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Select a text model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="mistral">Mistral</SelectItem>
              <SelectItem value="llama">Llama</SelectItem>
            </SelectContent>
          </Select>
          <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md text-gray-800 dark:text-gray-200 relative">
            {generatedText ? (
              <>
                <Markdown>{generatedText}</Markdown>
                <Button
                  onClick={() => handleCopyText(generatedText)}
                  className="absolute top-2 right-2 p-1 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <p>Loading...</p>
            )}
          </div>
        </div>
      </section>

      {/* PollinationsImage Hook Example */}
      <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <h2 className="text-2xl font-semibold">🛠️ PollinationsImage Hook</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Dynamically generate images using the <code>usePollinationsImage</code> hook.
        </p>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendImage(); 
                }
              }}
              placeholder="Enter a prompt for image generation"
              className="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
            />
            <Button onClick={handleSendImage} className="bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
          <Select value="flux" onValueChange={(value: ModelType) => setImageModel(value)}>
            <SelectTrigger className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600">
              <SelectValue placeholder="Select an image model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flux">Flux</SelectItem>
              <SelectItem value="flux-realism">Flux Realism</SelectItem>
              <SelectItem value="flux-anime">Flux Anime</SelectItem>
              <SelectItem value="flux-3d">Flux 3D</SelectItem>
              <SelectItem value="turbo">Turbo</SelectItem>
            </SelectContent>
          </Select>
          <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
            {generatedImage ? (
              <img src={generatedImage} alt="Generated by Pollinations" className="w-full h-auto" />
            ) : (
              <p className="text-gray-600 dark:text-gray-400">Loading image...</p>
            )}
          </div>
        </div>
      </section>

      {/* PollinationsChat Hook Example */}
      <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <h2 className="text-2xl font-semibold">🛠️ PollinationsChat Hook</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Dynamically interact with a chat interface using the <code>usePollinationsChat</code> hook.
        </p>
        <div className="space-y-4">
          <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md space-y-4">
            <div className="space-y-2">
              {messages.map((msg: Message, idx: number) => (
                <div key={idx} className="relative p-2 rounded-md bg-gray-200 dark:bg-gray-600">
                  <strong className="font-bold text-gray-900 dark:text-white">{msg.role}:</strong>{' '}
                  <span className="text-gray-800 dark:text-gray-200"><Markdown>{msg.content}</Markdown></span>
                  <Button
                    onClick={() => handleCopyText(msg.content)}
                    className="absolute top-1 right-1 p-1 bg-transparent hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex space-x-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission if inside a form
                    handleSendChatMessage(); // Call the function to send the image
                  }
                }}
                placeholder="Type a message"
                className="flex-grow bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <Button onClick={handleSendChatMessage} className="bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default function PollinationsComponentDocs() {
  // State for component configurations
  const [componentStates, setComponentStates] = useState<ComponentState[]>(
    pollinationComponents.map((component) => ({
      prompt: component.defaultPrompt,
      model: component.name === 'PollinationsImage' ? DEFAULT_IMAGE_MODELS[0] : DEFAULT_TEXT_MODELS[0],
      seed: DEFAULT_SEED,
      width: DEFAULT_IMAGE_WIDTH,
      height: DEFAULT_IMAGE_HEIGHT,
    }))
  );


  const debouncedComponentStates = useDebounce(componentStates, 2000);

  // State for available models
  const [textModels, setTextModels] = useState<string[]>(DEFAULT_TEXT_MODELS);
  const [imageModels, setImageModels] = useState<string[]>(DEFAULT_IMAGE_MODELS);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Fetch models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        // Fetch text models
        const textResponse = await fetch('https://text.pollinations.ai/models');
        const textData = await textResponse.json();
        setTextModels(textData.models || DEFAULT_TEXT_MODELS);

        // Fetch image models
        const imageResponse = await fetch('https://image.pollinations.ai/models');
        const imageData = await imageResponse.json();
        setImageModels(imageData || DEFAULT_IMAGE_MODELS);
      } catch (error) {
        console.error('Error fetching models:', error);
        // Use default models if fetch fails
        setTextModels(DEFAULT_TEXT_MODELS);
        setImageModels(DEFAULT_IMAGE_MODELS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Handle input change
  const handleInputChange = useCallback((index: number, field: keyof ComponentState, value: string | number) => {
    setComponentStates((prevStates) => {
      const updatedStates = [...prevStates];
      updatedStates[index] = { ...updatedStates[index], [field]: value };
      return updatedStates;
    });
  }, []);

  // Handle code copy
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      alert('Code copied to clipboard!');
    });
  };

  // If still loading, show a loading message
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-4 space-y-8">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-center">
            🌸 Pollinations Generative React Hooks & Components ^1.4.6 🌸
          </h1>
          <ThemeToggle />
        </header>
        {pollinationComponents.map((component, index) => (
          <section key={component.name} className="border border-border rounded-lg p-6 space-y-4 bg-card text-card-foreground">
            <h2 className="text-2xl font-semibold">🧩 {component.name}</h2>
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
              <div className="w-full md:w-48">
                <label htmlFor={`model-${index}`} className="block text-sm font-medium mb-1 text-muted-foreground">
                  Model:
                </label>
                <Select
                  value={componentStates[index].model}
                  onValueChange={(value) => handleInputChange(index, 'model', value)}
                >
                  <SelectTrigger id={`model-${index}`} className="bg-input text-input-foreground">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {(component.name === 'PollinationsImage' ? imageModels : textModels).map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">Generated Code:</h3>
                <Button
                  onClick={() => handleCopyCode(component.generateCode(componentStates[index]))}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <pre className="bg-muted text-muted-foreground p-4 rounded-md overflow-x-auto max-h-60">
                <code>{component.generateCode(componentStates[index])}</code>
              </pre>
            </div>
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Preview:</h3>
              <div className="border border-border p-4 rounded-md overflow-x-auto bg-card">
                {component.preview(debouncedComponentStates[index])}
              </div>
            </div>
          </section>
        ))}

        <section>
          <PollinationsDynamicExamples />
        </section>
      </div>

      <footer className="bg-muted text-muted-foreground py-4 mt-8">
        <div className="container mx-auto text-center">
          <div className="flex justify-center items-center space-x-4">
            <span>Made with ❤️ by</span>
            <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Pollinations.ai
            </a>
            <span>and</span>
            <a href="https://karma.yt" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Karma.yt
            </a>
          </div>
          <div className="mt-2">
            <a
              href="https://github.com/diogo-karma/pollinations-react-doc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-primary hover:underline"
            >
              <Github className="w-4 h-4 mr-2" />
              View on GitHub
            </a>
          </div>
          <div className="mt-2">
            <a
              href="https://www.npmjs.com/package/@pollinations/react"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-primary hover:underline"
            >
              View @pollinations/react on NPM
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}