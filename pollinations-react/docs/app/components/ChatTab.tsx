import React, { useState } from 'react'
import { usePollinationsChat } from '@pollinations/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Send, Flower, Bird } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useFetchModels } from '../hooks/useFetchModels'

export default function ChatComponent() {
  const { textModels } = useFetchModels()
  const [selectedTextModel, setSelectedTextModel] = useState<string>(textModels[0]?.name || 'openai')
  const [chatPrompt, setChatPrompt] = useState("")
  const [systemMessage, setSystemMessage] = useState<string>("You are a helpful AI assistant.")
  const [chatSeed, setChatSeed] = useState<number>(42)
  const [chatModel, setChatModel] = useState<string>(selectedTextModel)

  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: systemMessage }
  ], {
    seed: chatSeed,
    model: chatModel
  })

  const handleSendMessage = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (chatPrompt.trim()) {
      sendUserMessage(chatPrompt)
      setChatPrompt('')
    }
  }

  const getChatCode = (): string => {
    return `
import React, { useState, useEffect } from 'react';
import { usePollinationsChat } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const ChatComponent = () => {
  const [input, setInput] = useState('');
  const { sendUserMessage, messages } = usePollinationsChat([
    { role: "system", content: "${systemMessage}" }
  ], { 
    seed: ${chatSeed},
    model: '${chatModel}'
  });

  const handleSend = () => {
    if (input.trim()) {
      sendUserMessage(input);
      setInput('');
    }
  };


  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
            <div className={\`max-w-[70%] p-3 rounded-lg \${
              msg.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-900'
            }\`}>
              <span className="mr-2">{msg.role === 'user' ? '🐦' : '🌸'}</span>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
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
        <button 
          onClick={handleSend} 
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
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
      .then(() => {
        console.log('Code copied to clipboard')
        // You can add a toast notification here if you want
      })
      .catch(err => {
        console.error('Failed to copy code: ', err)
      })
  }

  return (
    <Card className="bg-slate-800 text-slate-100">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>Chat with Pollinations' AI</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4">
          <div>
            <Label htmlFor="systemMessage">System Message</Label>
            <Input
              id="systemMessage"
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              className="w-full bg-slate-700 text-slate-100"
            />
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <Label htmlFor="chatModel">Model</Label>
              <Select
                value={chatModel}
                onValueChange={setChatModel}
              >
                <SelectTrigger id="chatModel" className="w-full bg-slate-700 text-slate-100">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 text-slate-100">
                  {textModels.map((model) => (
                    <SelectItem key={model.name} value={model.name}>{model.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="chatSeed">Seed</Label>
              <Input
                id="chatSeed"
                type="number"
                value={chatSeed}
                onChange={(e) => setChatSeed(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full bg-slate-700 text-slate-100"
              />
            </div>
          </div>
          <div className="h-64 overflow-y-auto bg-slate-700 p-4 rounded-md space-y-4">
            {messages.map((msg: any, index: number) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] p-3 rounded-lg ${
                  msg.role === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-900'
                }`}>
                  <span className="mr-2">
                    {msg.role === 'user' ? <Bird className="inline-block w-4 h-4" /> : <Flower className="inline-block w-4 h-4" />}
                  </span>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
          <div className="flex space-x-2">
            <Textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder="Type your message..."
              className="w-full bg-slate-700 text-slate-100 flex-grow"
            />
            <Button 
              onClick={handleSendMessage}
              className="bg-blue-500 hover:bg-blue-600 transition-colors"
            >
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
        </form>
      </CardContent>
    </Card>
  )
}