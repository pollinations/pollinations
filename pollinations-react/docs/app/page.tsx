'use client'

import React, { useState, useEffect, KeyboardEvent, useRef } from 'react'
import { usePollinationsText, usePollinationsImage, usePollinationsChat } from '@pollinations/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

type TextCodeFormat = 'react' | 'curl' | 'wget' | 'javascript' | 'python' | 'rust' | 'go' | 'lua'
type ImageCodeFormat = 'react' | 'html' | 'markdown' | 'src'

interface TextModel {
  name: string
  type: 'chat' | 'completion'
  censored: boolean
}

type ImageModel = string

export default function PollinationsDemo() {
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'chat'>('text')
  const [textPrompt, setTextPrompt] = useState("Write a haiku about artificial intelligence")
  const [imagePrompt, setImagePrompt] = useState("A futuristic city with flying cars and neon lights")
  const [chatPrompt, setChatPrompt] = useState("")
  const [textCodeFormat, setTextCodeFormat] = useState<TextCodeFormat>('react')
  const [imageCodeFormat, setImageCodeFormat] = useState<ImageCodeFormat>('react')
  const [textModels, setTextModels] = useState<TextModel[]>([])
  const [imageModels, setImageModels] = useState<ImageModel[]>([])
  const [selectedTextModel, setSelectedTextModel] = useState<string>('openai')
  const [selectedImageModel, setSelectedImageModel] = useState<string>('flux')
  const [textSeed, setTextSeed] = useState<number>(42)
  const [imageSeed, setImageSeed] = useState<number>(42)
  const [imageWidth, setImageWidth] = useState<number>(1024)
  const [imageHeight, setImageHeight] = useState<number>(1024)
  const [systemMessage, setSystemMessage] = useState<string>("You are a helpful AI assistant.")
  const [chatSeed, setChatSeed] = useState<number>(42)
  const [chatModel, setChatModel] = useState<string>('openai')

  const chatContainerRef = useRef<HTMLDivElement>(null)

  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: systemMessage }
  ], {
    seed: chatSeed,
    model: chatModel
  })

  useEffect(() => {
    const fetchModels = async () => {
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
        // Fallback models
        setTextModels([{ name: 'openai', type: 'chat', censored: false }])
        setImageModels(['flux'])
      }
    }
    fetchModels()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  const textResult = usePollinationsText(textPrompt, {
    seed: textSeed,
    model: selectedTextModel
  })

  const imageUrl = usePollinationsImage(imagePrompt, {
    width: imageWidth,
    height: imageHeight,
    seed: imageSeed,
    model: selectedImageModel,
    nologo: true
  })

  const handleSendMessage = () => {
    if (chatPrompt.trim()) {
      sendUserMessage(chatPrompt)
      setChatPrompt('')
    }
  }

  const handleKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }

  const getTextCode = (format: TextCodeFormat): string => {
    const snippets: Record<TextCodeFormat, string> = {
      react: `
import React from 'react';
import { usePollinationsText } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const TextComponent: React.FC = () => {
  const text = usePollinationsText("${textPrompt}", { 
    seed: ${textSeed},
    model: '${selectedTextModel}'
  });
  
  return (
    <div>
      {text ? <ReactMarkdown>{text}</ReactMarkdown> : <p>Loading...</p>}
    </div>
  );
};

export default TextComponent;
      `,
      curl: `
curl -X GET "https://text.pollinations.ai/${encodeURIComponent(textPrompt)}?seed=${textSeed}&model=${selectedTextModel}"
      `,
      wget: `
wget -O output.txt "https://text.pollinations.ai/${encodeURIComponent(textPrompt)}?seed=${textSeed}&model=${selectedTextModel}"
      `,
      javascript: `
fetch('https://text.pollinations.ai/${encodeURIComponent(textPrompt)}?seed=${textSeed}&model=${selectedTextModel}')
  .then(response => response.text())
  .then(data => console.log(data))
  .catch((error) => console.error('Error:', error));
      `,
      python: `
import requests

url = f"https://text.pollinations.ai/${textPrompt}"
params = {
    "seed": ${textSeed},
    "model": "${selectedTextModel}"
}

response = requests.get(url, params=params)
print(response.text)
      `,
      rust: `
use reqwest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = format!("https://text.pollinations.ai/{}?seed={}&model={}",
        urlencoding::encode("${textPrompt}"),
        ${textSeed},
        "${selectedTextModel}"
    );
    let response = reqwest::get(&url).await?;
    let body = response.text().await?;
    println!("{}", body);
    Ok(())
}
      `,
      go: `
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "net/url"
)

func main() {
    baseURL := "https://text.pollinations.ai/"
    prompt := url.QueryEscape("${textPrompt}")
    fullURL := fmt.Sprintf("%s%s?seed=${textSeed}&model=${selectedTextModel}", baseURL, prompt)

    resp, err := http.Get(fullURL)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }

    fmt.Println(string(body))
}
      `,
      lua: `
local http = require("socket.http")
local ltn12 = require("ltn12")

local url = string.format("https://text.pollinations.ai/%s?seed=%d&model=%s",
    http.escape("${textPrompt}"),
    ${textSeed},
    "${selectedTextModel}"
)

local response = {}

local request, code = http.request{
    url = url,
    method = "GET",
    sink = ltn12.sink.table(response)
}

if code ~= 200 then
    print("HTTP request failed with code: " .. code)
else
    print(table.concat(response))
end
      `
    }
    return snippets[format]
  }

  const getImageCode = (format: ImageCodeFormat): string => {
    const imageUrlWithParams = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=${imageWidth}&height=${imageHeight}&seed=${imageSeed}&model=${selectedImageModel}&nologo=true`

    const snippets: Record<ImageCodeFormat, string> = {
      react: `
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const ImageComponent: React.FC = () => {
  const imageUrl = usePollinationsImage("${imagePrompt}", {
    width: ${imageWidth},
    height: ${imageHeight},
    seed: ${imageSeed},
    model: '${selectedImageModel}',
    nologo: true
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
      html: `
<img
  src="${imageUrlWithParams}"
  alt="${imagePrompt}"
  height="${imageHeight}"
  width="${imageWidth}"
/>
      `,
      markdown: `
![${imagePrompt}](${imageUrlWithParams})
      `,
      src: `
${imageUrlWithParams}
      `
    }
    return snippets[format]
  }

  const getChatCode = (): string => {
    return `
import React, { useState, useRef, useEffect } from 'react';
import { usePollinationsChat } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const ChatComponent: React.FC = () => {
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "${systemMessage}" }
  ], { 
    seed: ${chatSeed},
    model: '${chatModel}'
  });

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      sendUserMessage(input);
      setInput('');
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
            <div className={\`max-w-[70%] p-3 rounded-lg \${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
            }\`}>
              {msg.role === 'user' ? '🐦' : '🌸'} <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="w-full p-2 border rounded-lg"
        />
        <button onClick={handleSend} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg">
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatComponent;
    `
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="container mx-auto p-4 bg-slate-900 text-slate-100">
      <h1 className="text-4xl font-bold mb-2 text-center">
        <a href="https://github.com/pollinations/pollinations" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
          🌸 Pollinations Generative React Hooks 2.0.1 🌸
        </a>
      </h1>
      <h2 className="text-xl mb-8 text-center text-slate-300">This playground is designed to showcase the versatility and hackability of the Pollinations API</h2>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'text' | 'image' | 'chat')} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger
            value="text"
            className={`${activeTab === 'text' ? 'bg-slate-300 text-white underline' : 'bg-slate-800 text-slate-500'} transition-colors duration-200 hover:bg-slate-600`}
          >
            <span className="hidden sm:inline">usePollinationsText</span>
            <span className="sm:hidden">Text</span>
          </TabsTrigger>
          <TabsTrigger
            value="image"
            className={`${activeTab === 'image' ? 'bg-slate-300 text-white underline' : 'bg-slate-800 text-slate-500'} transition-colors duration-200 hover:bg-slate-600`}
          >
            <span className="hidden sm:inline">usePollinationsImage</span>
            <span className="sm:hidden">Image</span>
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className={`${activeTab === 'chat' ? 'bg-slate-300 text-white underline' : 'bg-slate-800 text-slate-500'} transition-colors duration-200 hover:bg-slate-600`}
          >
            <span className="hidden sm:inline">usePollinationsChat</span>
            <span className="sm:hidden">Chat</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="text">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Text Generation</CardTitle>
              <CardDescription>Generate text using Pollinations' API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <div>
                  <Label htmlFor="textPrompt">Prompt</Label>
                  <Input
                    id="textPrompt"
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="textModel">Model</Label>
                  <Select
                    value={selectedTextModel}
                    onValueChange={setSelectedTextModel}
                  >
                    <SelectTrigger id="textModel" className="bg-slate-700 text-slate-100">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 text-slate-100">
                      {textModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>{model.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="textSeed">Seed</Label>
                  <Input
                    id="textSeed"
                    type="number"
                    value={textSeed}
                    onChange={(e) => setTextSeed(Math.max(1, Number(e.target.value)))}
                    min={1}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Generated Text:</h3>
                  <div className="bg-slate-700 p-4 rounded-md">
                    {textResult ? (
                      <ReactMarkdown>{textResult}</ReactMarkdown>
                    ) : (
                      <p>Loading...</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Code Preview:</h3>
                  <div className="mb-4">
                    <Label htmlFor="textCodeFormat">Code Format</Label>
                    <Select
                      value={textCodeFormat}
                      onValueChange={(value) => setTextCodeFormat(value as TextCodeFormat)}
                    >
                      <SelectTrigger id="textCodeFormat" className="bg-slate-700 text-slate-100">
                        <SelectValue placeholder="Select a format" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 text-slate-100">
                        <SelectItem value="react">React</SelectItem>
                        <SelectItem value="curl">cURL</SelectItem>
                        <SelectItem value="wget">wget</SelectItem>
                        <SelectItem value="javascript">JavaScript</SelectItem>
                        <SelectItem value="python">Python</SelectItem>
                        <SelectItem value="rust">Rust</SelectItem>
                        <SelectItem value="go">Go</SelectItem>
                        <SelectItem value="lua">Lua</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <SyntaxHighlighter language="typescript" style={oneDark} className="rounded-md">
                      {getTextCode(textCodeFormat)}
                    </SyntaxHighlighter>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getTextCode(textCodeFormat))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="image">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Image Generation</CardTitle>
              <CardDescription>Generate images using Pollinations' API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <div>
                  <Label htmlFor="imagePrompt">Prompt</Label>
                  <Input
                    id="imagePrompt"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="imageModel">Model</Label>
                  <Select
                    value={selectedImageModel}
                    onValueChange={setSelectedImageModel}
                  >
                    <SelectTrigger id="imageModel" className="bg-slate-700 text-slate-100">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 text-slate-100">
                      {imageModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="imageSeed">Seed</Label>
                  <Input
                    id="imageSeed"
                    type="number"
                    value={imageSeed}
                    onChange={(e) => setImageSeed(Math.max(1, Number(e.target.value)))}
                    min={1}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="imageWidth">Width</Label>
                  <Input
                    id="imageWidth"
                    type="number"
                    value={imageWidth}
                    onChange={(e) => setImageWidth(Math.max(32, Number(e.target.value)))}
                    min={32}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="imageHeight">Height</Label>
                  <Input
                    id="imageHeight"
                    type="number"
                    value={imageHeight}
                    onChange={(e) => setImageHeight(Math.max(32, Number(e.target.value)))}
                    min={32}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Generated Image:</h3>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Generated image"
                      className="w-full h-auto rounded-md"
                    />
                  ) : (
                    <p>Loading...</p>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Code Preview:</h3>
                  <div className="mb-4">
                    <Label htmlFor="imageCodeFormat">Code Format</Label>
                    <Select
                      value={imageCodeFormat}
                      onValueChange={(value) => setImageCodeFormat(value as ImageCodeFormat)}
                    >
                      <SelectTrigger id="imageCodeFormat" className="bg-slate-700 text-slate-100">
                        <SelectValue placeholder="Select a format" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 text-slate-100">
                        <SelectItem value="react">React</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="src">Image URL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <SyntaxHighlighter language="typescript" style={oneDark} className="rounded-md">
                      {getImageCode(imageCodeFormat)}
                    </SyntaxHighlighter>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getImageCode(imageCodeFormat))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="chat">
          <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>Chat with Pollinations' AI</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <div>
                  <Label htmlFor="systemMessage">System Message</Label>
                  <Input
                    id="systemMessage"
                    value={systemMessage}
                    onChange={(e) => setSystemMessage(e.target.value)}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="chatSeed">Seed</Label>
                  <Input
                    id="chatSeed"
                    type="number"
                    value={chatSeed}
                    onChange={(e) => setChatSeed(Math.max(1, Number(e.target.value)))}
                    min={1}
                    className="bg-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <Label htmlFor="chatModel">Model</Label>
                  <Select
                    value={chatModel}
                    onValueChange={setChatModel}
                  >
                    <SelectTrigger id="chatModel" className="bg-slate-700 text-slate-100">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 text-slate-100">
                      {textModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>{model.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div ref={chatContainerRef} className="h-64 overflow-y-auto bg-slate-700 p-4 rounded-md space-y-4">
                  {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                        }`}>
                        {msg.role === 'user' ? '🐦' : '🌸'} <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <Textarea
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="bg-slate-700 text-slate-100 flex-grow"
                  />
                  <Button onClick={handleSendMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Code Preview:</h3>
                  <div className="relative">
                    <SyntaxHighlighter language="typescript" style={oneDark} className="rounded-md">
                      {getChatCode()}
                    </SyntaxHighlighter>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(getChatCode())}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <footer className="mt-8 text-center text-slate-300">
        <p>Made with ❤️ by <a className='hover:underline' href="https://pollinations.ai">Pollinations.ai</a>
         &nbsp;and&nbsp;
          <a className='hover:underline' href="https://karma.yt" title='Karma.yt'>Karma.yt</a></p>
        <div className="mt-2 flex justify-center space-x-4">
          <a href="https://github.com/pollinations/pollinations" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            View on GitHub
          </a>
          <a href="https://www.npmjs.com/package/@pollinations/react" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            @pollinations/react on NPM
          </a>
          <a href="https://discord.com/invite/kuPRYEJS" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            <svg className="w-6 h-6 inline-block mr-1" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Discord
          </a>
          <a href="https://chat.whatsapp.com/JxQEn2FKDny0DdwkDuzoQR" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            <svg className="w-6 h-6 inline-block mr-1" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967c-.273-.099-.471-.148-.67.15c-.197.297-.767.966-.94 1.164c-.173.199-.347.223-.644.075c-.297-.15-1.255-.463-2.39-1.475c-.883-.788-1.48-1.761-1.653-2.059c-.173-.297-.018-.458.13-.606c.134-.133.298-.347.446-.52c.149-.174.198-.298.298-.497c.099-.198.05-.371-.025-.52c-.075-.149-.669-1.612-.916-2.207c-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372c-.272.297-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487c.709.306 1.262.489 1.694.625c.712.227 1.36.195 1.871.118c.571-.085 1.758-.719 2.006-1.413c.248-.694.248-1.289.173-1.413c-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214l-3.741.982l.998-3.648l-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </footer>
    </div>
  )
}