'use client'
import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { usePollinationsImage, usePollinationsText, usePollinationsChat } from '@pollinations/react';
import { Copy, Github, Send } from 'lucide-react';
import Markdown from 'react-markdown';

// Constants
const DEFAULT_SEED = 42;
const DEFAULT_IMAGE_WIDTH = 800;
const DEFAULT_IMAGE_HEIGHT = 600;

// Types
type ModelType = string;

interface TextModel {
  name: string;
  type: 'chat' | 'completion';
  censored: boolean;
}

type ImageModel = string;

// Default models
const DEFAULT_TEXT_MODELS: TextModel[] = [
  { name: 'openai', type: 'chat', censored: true },
  { name: 'mistral', type: 'completion', censored: false },
  { name: 'llama', type: 'completion', censored: true },
];
const DEFAULT_IMAGE_MODELS: ImageModel[] = ['turbo', 'flux', 'flux-realism', 'flux-anime', 'flux-3d', 'any-dark'];

const PollinationsDynamicExamples: React.FC = () => {
  // State for text generation
  const [textInput, setTextInput] = useState<string>('Write a short haiku about Pollinations.AI');
  const [textModel, setTextModel] = useState<TextModel>(DEFAULT_TEXT_MODELS[0].name);

  // State for image generation
  const [imageInput, setImageInput] = useState<string>('A beautiful sunset over the ocean');
  const [imageModel, setImageModel] = useState<ModelType>('flux');

  // State for chat
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessage, setChatMessage] = useState<string>('What can you tell me about pollination?');

  // State for available models
  const [textModels, setTextModels] = useState<TextModel[]>(DEFAULT_TEXT_MODELS);
  const [imageModels, setImageModels] = useState<ImageModel[]>(DEFAULT_IMAGE_MODELS);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);

  // Generated content using hooks
  const generatedText = usePollinationsText(textInput, {
    seed: DEFAULT_SEED,
    model: textModel,
    systemPrompt: 'You are a poetic AI assistant.',
  });

  const generatedImage = usePollinationsImage(imageInput, {
    width: DEFAULT_IMAGE_WIDTH,
    height: DEFAULT_IMAGE_HEIGHT,
    seed: DEFAULT_SEED,
    model: imageModel,
    nologo: true,
    enhance: false,
  });

  const { sendUserMessage, messages } = usePollinationsChat([
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'assistant', content: chatMessage }
  ], {
    seed: DEFAULT_SEED,
    jsonMode: false,
    model: 'mistral',
  });

  // Fetch models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        // Fetch text models
        const textResponse = await fetch('https://text.pollinations.ai/models');
        const textData: TextModel[] = await textResponse.json();
        setTextModels(textData.length > 0 ? textData : DEFAULT_TEXT_MODELS);

        // Fetch image models
        const imageResponse = await fetch('https://image.pollinations.ai/models');
        const imageData: ImageModel[] = await imageResponse.json();
        setImageModels(imageData.length > 0 ? imageData : DEFAULT_IMAGE_MODELS);
      } catch (error) {
        console.error('Error fetching models:', error);
        // Use default models if fetch fails
        setTextModels(DEFAULT_TEXT_MODELS);
        setImageModels(DEFAULT_IMAGE_MODELS);
      }
    };

    fetchModels();
  }, []);

  useEffect(() => {
    setIsImageLoading(true);
  }, [imageInput, imageModel]);

  const handleImageLoad = () => {
    setIsImageLoading(false);
  };

  // Handle sending chat messages
  const handleSendChatMessage = useCallback(() => {
    if (chatInput.trim()) {
      sendUserMessage(chatInput);
      setChatInput('');
    }
  }, [chatInput, sendUserMessage]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-4 space-y-8">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-center">
            🌸 Pollinations Generative React Hooks ^2.0.0 🌸
          </h1>
          <ThemeToggle />
        </header>
        <div className="space-y-12 dark:bg-gray-800">
          <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <h2 className="text-2xl font-semibold">🛠️ usePollinationsText Hook</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Generate text using the <code>usePollinationsText</code> hook.
            </p>
            <div className="space-y-4">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter a prompt for text generation"
                className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <Select value={textModel} onValueChange={(value: ModelType) => setTextModel(value)}>
                <SelectTrigger className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select a text model" />
                </SelectTrigger>
                <SelectContent>
                  {textModels.map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                      {model.name} ({model.type}, {model.censored ? 'censored' : 'uncensored'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md text-gray-800 dark:text-gray-200 relative">
                {generatedText ? (
                  <>
                    <Markdown>{generatedText}</Markdown>
                    <Button
                      onClick={() => navigator.clipboard.writeText(generatedText)}
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

          <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <h2 className="text-2xl font-semibold">🛠️ usePollinationsImage Hook</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Generate images using the <code>usePollinationsImage</code> hook.
            </p>
            <div className="space-y-4">
              <Input
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                placeholder="Enter a prompt for image generation"
                className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <Select value={imageModel} onValueChange={(value: ModelType) => setImageModel(value)}>
                <SelectTrigger className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Select an image model" />
                </SelectTrigger>
                <SelectContent>
                  {imageModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md relative">
                {generatedImage && (
                  <img
                    src={generatedImage}
                    alt="Generated by Pollinations"
                    className={`w-full h-auto transition-opacity duration-300 ${isImageLoading ? 'opacity-0 blur-lg' : 'opacity-100 blur-0'}`}
                    onLoad={handleImageLoad}
                  />
                )}
                {isImageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-600 dark:text-gray-400">Loading image...</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <h2 className="text-2xl font-semibold">🛠️ usePollinationsChat Hook</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Generate chat responses using the <code>usePollinationsChat</code> hook.
            </p>
            <div className="space-y-4">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md space-y-4">
                <div className="space-y-2">
                  {messages.map((msg, idx) => (
                    <div key={idx} className="relative p-2 rounded-md bg-gray-200 dark:bg-gray-600">
                      <strong className="font-bold text-gray-900 dark:text-white">{msg.role}:</strong>{' '}
                      <span className="text-gray-800 dark:text-gray-200"><Markdown>{msg.content}</Markdown></span>
                      <Button
                        onClick={() => navigator.clipboard.writeText(msg.content)}
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
                        e.preventDefault();
                        handleSendChatMessage();
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
                  href="https://github.com/pollinations/pollinations/tree/master/pollinations-react"
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
      </div>
    </div>
  );
};

export default PollinationsDynamicExamples;