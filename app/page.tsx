'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
// @ts-expect-error todo: interfaces
import { PollinationsText, PollinationsImage, PollinationsMarkdown, usePollinationsImage, usePollinationsText, usePollinationsChat } from '@pollinations/react';
import { Copy, Github } from 'lucide-react';

// Constants
const DEFAULT_SEED = 42;
const DEFAULT_IMAGE_WIDTH = 800;
const DEFAULT_IMAGE_HEIGHT = 600;

// Default models as fallback
const DEFAULT_TEXT_MODELS = ['openai', 'mistral', 'llama'];
const DEFAULT_IMAGE_MODELS = ['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'any-dark', 'turbo'];

// Types
type ModelType = string;

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
      <PollinationsText seed={seed} model={model} systemPrompt="You are a helpful assistant.">
        {prompt}
      </PollinationsText>
    ),
  },
  {
    name: 'PollinationsImage',
    description: "Generates and displays images using Pollination's API.",
    defaultPrompt: 'A detailed illustration of hand-pollination',
    generateCode: ({ prompt, model, seed, width, height }) =>
      `<PollinationsImage prompt="${prompt}" width={${width}} height={${height}} seed={${seed}} model="${model}" />`,
    preview: ({ prompt, model, seed, width, height }) => (
      <PollinationsImage prompt={prompt} width={width} height={height} seed={seed} model={model} />
    ),
  },
  {
    name: 'PollinationsMarkdown',
    description: "Generates and displays markdown text using Pollination's API.",
    defaultPrompt: 'Create a markdown guide on hand-pollination techniques',
    generateCode: ({ prompt, model, seed }) =>
      `<PollinationsMarkdown seed={${seed}} model="${model}" systemPrompt="You are a technical writer.">${prompt}</PollinationsMarkdown>`,
    preview: ({ prompt, model, seed }) => (
      <PollinationsMarkdown seed={seed} model={model} systemPrompt="You are a technical writer.">
        {prompt}
      </PollinationsMarkdown>
    ),
  },
];


const hookConfigurations = [
  {
    name: 'usePollinationsImage',
    description: "Generate image URLs using Pollinations' API.",
    defaultConfig: {
      prompt: 'A beautiful sunset over the ocean',
      width: 800,
      height: 600,
      seed: 42,
      model: 'turbo',
      nologo: true,
      enhance: false,
    },
    generateCode: (config: ImageHookConfig) => `
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const ImageComponent = () => {
  const imageUrl = usePollinationsImage('${config.prompt}', {
    width: ${config.width},
    height: ${config.height},
    seed: ${config.seed},
    model: '${config.model}',
    nologo: ${config.nologo},
    enhance: ${config.enhance},
  });

  return (
    <div>
      {imageUrl ? <img src={imageUrl} alt="Generated" /> : <p>Loading...</p>}
    </div>
  );
};

export default ImageComponent;
    `,
    preview: (config: ImageHookConfig) => {
      const imageUrl = usePollinationsImage(config.prompt, {
        width: config.width,
        height: config.height,
        seed: config.seed,
        model: config.model,
        nologo: config.nologo,
        enhance: config.enhance,
      });
      return imageUrl ? <img src={imageUrl} alt="Generated" /> : <p>Loading...</p>;
    },
  },
  {
    name: 'usePollinationsText',
    description: "Generate text using Pollinations' API.",
    defaultConfig: {
      prompt: 'Write a short haiku about Pollinations.AI',
      seed: 42,
      model: 'mistral',
      systemPrompt: 'You are a poetic AI assistant.',
    },
    generateCode: (config: TextHookConfig) => `
import React from 'react';
import { usePollinationsText } from '@pollinations/react';

const TextComponent = () => {
  const text = usePollinationsText('${config.prompt}', {
    seed: ${config.seed},
    model: '${config.model}',
    systemPrompt: '${config.systemPrompt}',
  });

  return (
    <div>
      {text ? <p>{text}</p> : <p>Loading...</p>}
    </div>
  );
};

export default TextComponent;
    `,
    preview: (config: TextHookConfig) => {
      const text = usePollinationsText(config.prompt, {
        seed: config.seed,
        model: config.model,
        systemPrompt: config.systemPrompt,
      });
      return text ? <p>{text}</p> : <p>Loading...</p>;
    },
  },
  {
    name: 'usePollinationsChat',
    description: "Generate chat responses using Pollinations' API.",
    defaultConfig: {
      initialMessage: 'Hello, how can I help you today?',
      seed: 42,
      jsonMode: false,
      model: 'mistral',
    },
    generateCode: (config: ChatHookConfig) => `
import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "You are a helpful assistant" },
    { role: "assistant", content: "${config.initialMessage}" }
  ], {
    seed: ${config.seed},
    jsonMode: ${config.jsonMode},
    model: '${config.model}',
  });

  const handleSend = () => {
    sendUserMessage(input);
    setInput('');
  };

  return (
    <div>
      <div>
        {messages.map((msg, index) => (
          <p key={index}><strong>{msg.role}:</strong> {msg.content}</p>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend}>Send</button>
    </div>
  );
};

export default ChatComponent;
    `,
    preview: (config: ChatHookConfig) => {
      const [input, setInput] = useState('');
      const { sendUserMessage, messages } = usePollinationsChat([
        { role: "system", content: "You are a helpful assistant" },
        { role: "assistant", content: config.initialMessage }
      ], {
        seed: config.seed,
        jsonMode: config.jsonMode,
        model: config.model,
      });

      const handleSend = () => {
        sendUserMessage(input);
        setInput('');
      };

      return (
        <div>
          <div>
            {messages.map((msg, index) => (
              <p key={index}><strong>{msg.role}:</strong> {msg.content}</p>
            ))}
          </div>
          <Input value={input} onChange={(e) => setInput(e.target.value)} />
          <Button onClick={handleSend}>Send</Button>
        </div>
      );
    },
  },
];


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

  // State for available models
  const [textModels, setTextModels] = useState<string[]>(DEFAULT_TEXT_MODELS);
  const [imageModels, setImageModels] = useState<string[]>(DEFAULT_IMAGE_MODELS);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  const [hookStates, setHookStates] = useState(
    hookConfigurations.map(config => ({ ...config.defaultConfig }))
  );


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

  const handleHookInputChange = useCallback((index: number, field: string, value: string | number | boolean) => {
    setHookStates((prevStates) => {
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
                {component.preview(componentStates[index])}
              </div>
            </div>
          </section>
        ))}

        <section className="border border-border rounded-lg p-6 space-y-4 bg-card text-card-foreground mt-8">
          <h2 className="text-3xl font-bold">🛠️ Hooks</h2>

          <div className="mt-6">
            <h3 className="text-2xl font-semibold">usePollinationsImage</h3>
            <p className="text-muted-foreground">
              The usePollinationsImage hook allows you to generate image URLs from Pollinations' API and use them directly in your React components.
            </p>
            <pre className="bg-muted text-muted-foreground p-4 rounded-md overflow-x-auto mt-4">
              <code>{`import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const SunsetImageComponent = () => {
  const imageUrl = usePollinationsImage('A beautiful sunset over the ocean', {
    width: 800,
    height: 600,
    seed: 42,
    model: 'turbo',
    nologo: true,
    enhance: false
  });

  return (
    <div>
      {imageUrl ? <img src={imageUrl} alt="Sunset" /> : <p>Loading...</p>}
    </div>
  );
};

export default SunsetImageComponent;`}</code>
            </pre>
            <h4 className="text-xl font-semibold mt-4">Options</h4>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>width (number, default: 1024): The width of the generated image.</li>
              <li>height (number, default: 1024): The height of the generated image.</li>
              <li>model (string, default: 'turbo'): The model to use for image generation.</li>
              <li>seed (number, default: -1): The seed for random image generation. If -1, a random seed will be used.</li>
              <li>nologo (boolean, default: true): Whether to generate the image without a logo.</li>
              <li>enhance (boolean, default: false): Whether to enhance the generated image.</li>
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-2xl font-semibold">usePollinationsText</h3>
            <p className="text-muted-foreground">
              The usePollinationsText hook allows you to generate text from Pollinations' API and use it directly in your React components.
            </p>
            <pre className="bg-muted text-muted-foreground p-4 rounded-md overflow-x-auto mt-4">
              <code>{`import React from 'react';
import { usePollinationsText } from '@pollinations/react';

const HaikuComponent = () => {
  const text = usePollinationsText('Write a short haiku about Pollinations.AI', {
    seed: 42,
    model: 'mistral',
    systemPrompt: 'You are a poetic AI assistant.'
  });

  return (
    <div>
      {text ? <p>{text}</p> : <p>Loading...</p>}
    </div>
  );
};

export default HaikuComponent;`}</code>
            </pre>
            <h4 className="text-xl font-semibold mt-4">Options</h4>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>seed (number, default: -1): The seed for random text generation. If -1, a random seed will be used.</li>
              <li>model (string, default: 'openai'): The model to use for text generation. Options: 'openai', 'mistral'.</li>
              <li>systemPrompt (string, optional): A system prompt to set the behavior of the AI.</li>
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-2xl font-semibold">usePollinationsChat</h3>
            <p className="text-muted-foreground">
              The usePollinationsChat hook allows you to generate chat responses from Pollinations' API and use them directly in your React components.
            </p>
            <pre className="bg-muted text-muted-foreground p-4 rounded-md overflow-x-auto mt-4">
              <code>{`import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';

const ChatComponent = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "You are a helpful assistant" }
  ], {
    seed: 42,
    jsonMode: false,
    model: 'mistral'
  });

  const handleSend = () => {
    sendUserMessage(input);
    setInput('');
  };

  return (
    <div>
      <div>
        {messages.map((msg, index) => (
          <p key={index}><strong>{msg.role}:</strong> {msg.content}</p>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend}>Send</button>
    </div>
  );
};

export default ChatComponent;`}</code>
            </pre>
            <h4 className="text-xl font-semibold mt-4">Options</h4>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>seed (number, default: 42): The seed for random text generation.</li>
              <li>jsonMode (boolean, default: false): Whether to parse the response as JSON.</li>
              <li>model (string, default: 'openai'): The model to use for chat generation.</li>
            </ul>
          </div>
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
        </div>
      </footer>
    </div>
  );
}