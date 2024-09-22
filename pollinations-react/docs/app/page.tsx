'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Send, Copy, User, Bot, Flower, Bird } from 'lucide-react'
// @ts-expect-error todo: interfaces
import { usePollinationsText, usePollinationsImage, usePollinationsChat } from '@pollinations/react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Define types for our models and parameters
type TextModel = {
  name: string
  type: 'chat' | 'completion'
  censored: boolean
}

type ImageModel = string

type TextParams = {
  prompt: string
  seed: number
  model: string
}

type ImageParams = {
  prompt: string
  width: number
  height: number
  seed: number
  model: string
  nologo: boolean
}

type ChatParams = {
  systemMessage: string
  seed: number
  model: string
}

type HookParams = {
  usePollinationsText: TextParams
  usePollinationsImage: ImageParams
  usePollinationsChat: ChatParams
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export default function PollinationsDocsComponent() {
  const [activeHook, setActiveHook] = useState<keyof HookParams>('usePollinationsText')
  const [params, setParams] = useState<HookParams>({
    usePollinationsText: {
      prompt: 'Write a short haiku about Pollinations.AI',
      seed: 42,
      model: 'openai',
    },
    usePollinationsImage: {
      prompt: 'A beautiful sunset over the ocean',
      width: 1024,
      height: 1024,
      seed: 42,
      model: 'flux',
      nologo: true,
    },
    usePollinationsChat: {
      systemMessage: 'You are a helpful assistant',
      seed: 42,
      model: 'openai',
    }
  })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [textModels, setTextModels] = useState<TextModel[]>([])
  const [imageModels, setImageModels] = useState<ImageModel[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Hook results
  const textResult = usePollinationsText(params.usePollinationsText.prompt, params.usePollinationsText)
  const imageResult = usePollinationsImage(params.usePollinationsImage.prompt, params.usePollinationsImage)
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: params.usePollinationsChat.systemMessage }
  ], params.usePollinationsChat)

  // Fetch models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoading(true)
      try {
        const [textResponse, imageResponse] = await Promise.all([
          fetch('https://text.pollinations.ai/models'),
          fetch('https://image.pollinations.ai/models')
        ])
        const textData: TextModel[] = await textResponse.json()
        const imageData: ImageModel[] = await imageResponse.json()
        setTextModels(textData)
        setImageModels(imageData)
      } catch (error) {
        console.error('Error fetching models:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchModels()
  }, [])

  // Update parameter values
  const updateParam = useCallback(<T extends keyof HookParams>(
    hook: T,
    param: keyof HookParams[T],
    value: HookParams[T][keyof HookParams[T]]
  ) => {
    setParams(prev => ({
      ...prev,
      [hook]: {
        ...prev[hook],
        [param]: value
      }
    }))
  }, [])

  // Generate code snippet based on current hook and parameters
  const getCode = (hook: keyof HookParams): string => {
    const codeSnippets: Record<keyof HookParams, string> = {
      usePollinationsText: `
import React from 'react';
import { usePollinationsText } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const TextComponent: React.FC = () => {
  const text = usePollinationsText('${params.usePollinationsText.prompt}', { 
    seed: ${params.usePollinationsText.seed},
    model: '${params.usePollinationsText.model}'
  });
  
  return (
    <div>
      {text ? <ReactMarkdown>{text}</ReactMarkdown> : <p>Loading...</p>}
    </div>
  );
};

export default TextComponent;
      `,
      usePollinationsImage: `
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const ImageComponent: React.FC = () => {
  const imageUrl = usePollinationsImage('${params.usePollinationsImage.prompt}', {
    width: ${params.usePollinationsImage.width},
    height: ${params.usePollinationsImage.height},
    seed: ${params.usePollinationsImage.seed},
    model: '${params.usePollinationsImage.model}',
    nologo: ${params.usePollinationsImage.nologo}
  });

  return (
    <div>
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt="Generated image" 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default ImageComponent;
      `,
      usePollinationsChat: `
import React, { useState } from 'react';
import { usePollinationsChat } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const ChatComponent: React.FC = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "${params.usePollinationsChat.systemMessage}" }
  ], { 
    seed: ${params.usePollinationsChat.seed}, 
    model: '${params.usePollinationsChat.model}'
  });

  const handleSend = () => {
    sendUserMessage(input);
    setInput('');
  };

  return (
    <div>
      <div>
        {messages.map((msg: any, index: number) => (
          <div key={index} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
            <strong>{msg.role}:</strong>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
    
    </div>
  );
};

export default ChatComponent;
      `
    }
    return codeSnippets[hook]
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeHook === 'usePollinationsChat') {
      sendUserMessage(chatInput)
      setChatInput('')
    } else if (activeHook === 'usePollinationsText') {
      // Trigger text generation
      // Note: In a real implementation, you would call the actual API here
      console.log('Generating text with:', params.usePollinationsText)
    }
  }

  // Copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (isLoading) {
    return <div className="p-4 bg-slate-900 text-slate-100">Loading...</div>
  }

  return (
    <div className="container mx-auto p-4 bg-slate-900 text-slate-100">
      <h1 className="text-3xl font-bold mb-4 text-center">🌸 Pollinations Generative React Hooks 2.0.1🌸</h1>
      <p className="mb-4 text-center">A simple way to generate images, text and markdown using the Pollinations API in your React projects.</p>

      <Tabs value={activeHook} onValueChange={(value) => setActiveHook(value as keyof HookParams)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="usePollinationsText" className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100">usePollinationsText</TabsTrigger>
          <TabsTrigger value="usePollinationsImage" className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100">usePollinationsImage</TabsTrigger>
          <TabsTrigger value="usePollinationsChat" className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100">usePollinationsChat</TabsTrigger>
        </TabsList>
        <TabsContent value="usePollinationsText">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>usePollinationsText</CardTitle>
              <CardDescription>Generate text using Pollinations' API</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="prompt" className="text-lg font-semibold">Prompt</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="prompt"
                      value={params.usePollinationsText.prompt}
                      onChange={(e) => updateParam('usePollinationsText', 'prompt', e.target.value)}
                      className="flex-grow bg-slate-700 text-slate-100"
                      min={1}
                      max={16000}
                    />
              
                  </div>
                </div>
                <div className="flex space-x-4">
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="seed">Seed</Label>
                    <Input
                      id="seed"
                      type="number"
                      value={params.usePollinationsText.seed}
                      onChange={(e) => updateParam('usePollinationsText', 'seed', parseInt(e.target.value))}
                      className="bg-slate-700 text-slate-100"
                      min={1}
                      max={16000}
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={params.usePollinationsText.model}
                      onValueChange={(value) => updateParam('usePollinationsText', 'model', value)}
                    >
                      <SelectTrigger id="model" className="bg-slate-700 text-slate-100">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 text-slate-100">
                        {textModels.map((model) => (
                          <SelectItem key={model.name} value={model.name}>{model.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </form>
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Preview:</h3>
                <div className="bg-slate-700 p-4 rounded-md">
                  {textResult ? (
                    <ReactMarkdown>{textResult}</ReactMarkdown>
                  ) : (
                    <p>Loading...</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => copyToClipboard(textResult || '')}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="usePollinationsImage">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>usePollinationsImage</CardTitle>
              <CardDescription>Generate image URLs using Pollinations' API</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="prompt" className="text-lg font-semibold">Prompt</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="prompt"
                      value={params.usePollinationsImage.prompt}
                      onChange={(e) => updateParam('usePollinationsImage', 'prompt', e.target.value)}
                      className="flex-grow bg-slate-700 text-slate-100"
                      min={1}
                      max={16000}
                    />
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-500">
                      Imagine
                    </Button>
                  </div>
                </div>
                <div className="flex space-x-4">
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      type="number"
                      value={params.usePollinationsImage.width}
                      onChange={(e) => updateParam('usePollinationsImage', 'width', parseInt(e.target.value))}
                      className="bg-slate-700 text-slate-100"
                      min={1024}
                      max={16000}
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      type="number"
                      value={params.usePollinationsImage.height}
                      onChange={(e) => updateParam('usePollinationsImage', 'height', parseInt(e.target.value))}
                      className="bg-slate-700 text-slate-100"
                      min={1024}
                      max={16000}
                    />
                  </div>
                </div>
                <div className="flex space-x-4">
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="seed">Seed</Label>
                    <Input
                      id="seed"
                      type="number"
                      value={params.usePollinationsImage.seed}
                      onChange={(e) => updateParam('usePollinationsImage', 'seed', parseInt(e.target.value))}
                      className="bg-slate-700 text-slate-100"
                      min={1}
                      max={16000}
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={params.usePollinationsImage.model}
                      onValueChange={(value) => updateParam('usePollinationsImage', 'model', value)}
                    >
                      <SelectTrigger id="model" className="bg-slate-700 text-slate-100">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 text-slate-100">
                        {imageModels.map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="nologo"
                    checked={params.usePollinationsImage.nologo}
                    onCheckedChange={(checked) => updateParam('usePollinationsImage', 'nologo', checked as boolean)}
                  />
                  <label htmlFor="nologo" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">No Logo</label>
                </div>
              </form>
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Preview:</h3>
                {imageResult ? (
                  <div className="relative w-full h-[calc(100vh-200px)] min-h-[400px]">
                    <img
                      src={imageResult}
                      alt="Generated image"
                      className="absolute inset-0 w-full h-full object-contain rounded-md"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(imageResult)}
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copy URL
                    </Button>
                  </div>
                ) : (
                  <p>Loading...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="usePollinationsChat">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>usePollinationsChat</CardTitle>
              <CardDescription>Generate chat responses using Pollinations' API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 max-h-96 overflow-y-auto bg-slate-700 p-4 rounded-md">
                {messages.map((msg: any, index: number) => (
                  <div key={index} className={`flex items-start mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-center ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`rounded-full p-2 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-pink-500'} mr-2`}>
                        {msg.role === 'user' ? <Bird className="h-6 w-6" /> : <Flower className="h-6 w-6" />}
                      </div>
                      <div className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500' : 'bg-pink-500'} max-w-md`}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() => copyToClipboard(msg.content)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-grow bg-slate-700 text-slate-100"
                  min={1}
                  max={16000}
                />
                <Button type="submit" className="bg-blue-600 hover:bg-blue-500">
                <Send className="ml-2 h-4 w-4" />
                </Button>
              </form>
            
              <div className="mt-4 grid w-full items-center gap-4">
                <h1 className="text-sm text-muted-foreground">Let's parameterize</h1>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="systemMessage" className="text-lg font-semibold">System Message</Label>
                  <Input
                    id="systemMessage"
                    value={params.usePollinationsChat.systemMessage}
                    onChange={(e) => updateParam('usePollinationsChat', 'systemMessage', e.target.value)}
                    className="bg-slate-700 text-slate-100"
                    min={1}
                    max={16000}
                  />
                </div>
                <div className="flex space-x-4">
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="seed">Seed</Label>
                    <Input
                      id="seed"
                      type="number"
                      value={params.usePollinationsChat.seed}
                      onChange={(e) => updateParam('usePollinationsChat', 'seed', parseInt(e.target.value))}
                      className="bg-slate-700 text-slate-100"
                      min={1}
                      max={16000}
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5 flex-1">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      value={params.usePollinationsChat.model}
                      onValueChange={(value) => updateParam('usePollinationsChat', 'model', value)}
                    >
                      <SelectTrigger id="model" className="bg-slate-700 text-slate-100">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 text-slate-100">
                        {textModels.map((model) => (
                          <SelectItem key={model.name} value={model.name}>{model.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8 bg-slate-800 text-slate-100">
        <CardHeader>
          <CardTitle>Code Preview</CardTitle>
          <CardDescription>Copy and paste this code into your React project</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <SyntaxHighlighter language="typescript" style={oneDark} className="rounded-md">
            {getCode(activeHook)}
          </SyntaxHighlighter>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2"
            onClick={() => copyToClipboard(getCode(activeHook))}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <footer className="mt-8 text-center text-sm text-slate-400">
        <p>Made with ❤️ by <a target="_blank" className='hover:underline' href="https://pollinations.ai">Pollinations.ai</a> and <a target="_blank" className="hover:underline" href="https://karma.yt">Karma.yt</a></p>
        <div className="mt-2">
          <a target="_blank" href="https://github.com/pollinations/pollinations" className="hover:text-slate-200 hover:underline mr-4">View on GitHub</a>
          <a target="_blank" href="https://www.npmjs.com/package/@pollinations/react" className="hover:text-slate-200 hover:underline">View @pollinations/react on NPM</a>
        </div>
      </footer>
    </div>
  )
}