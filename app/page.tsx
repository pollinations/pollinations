'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
// @ts-expect-error todo: interfaces
import { PollinationsText, PollinationsImage, PollinationsMarkdown } from '@pollinations/react';

const components = [
  {
    name: 'PollinationsText',
    description: 'The PollinationsText component simplifies the process of generating and displaying plain text using Pollination\'s API.',
    generateCode: (prompt: string) => `<PollinationsText seed={42} model="openai" systemPrompt="You are a helpful assistant.">${prompt}</PollinationsText>`,
    preview: (prompt: string) =>   <PollinationsText seed={42} model="openai" systemPrompt="You are a helpful assistant.">
    {prompt}
  </PollinationsText>
  },
  {
    name: 'PollinationsImage',
    description: 'The PollinationsImage component simplifies the process of generating and displaying images using Pollination\'s API.',
    generateCode: (prompt: string) => `
<PollinationsImage prompt="${prompt}" width={800} height={600} seed={42} />`,
    preview: (prompt: string) => (
      <PollinationsImage prompt={prompt} width={800} height={600} seed={42} />
    )
  },
  {
    name: 'PollinationsMarkdown',
    description: 'The PollinationsMarkdown component simplifies the process of generating and displaying markdown text using Pollinations\' API.',
    generateCode: (prompt: string) => `
  <PollinationsMarkdown seed={42} model="openai" systemPrompt="You are a technical writer.">
    ${prompt}
  </PollinationsMarkdown>`,
    preview: (prompt: string) => (
      <PollinationsMarkdown seed={42} model="openai" systemPrompt='${prompt}'>
    ${prompt}
  </PollinationsMarkdown>
    )
  }
]

export default function ComponentDocs() {
  const [prompts, setPrompts] = useState(components.map(() => ''))

  const handlePromptChange = (index: number, value: string) => {
    setPrompts(prev => {
      const newPrompts = [...prev]
      newPrompts[index] = value
      return newPrompts
    })
  }

  return (
    <div className="container mx-auto p-4 space-y-8 min-h-screen bg-background text-foreground">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🌸 Pollinations Generative React Hooks & Components 🌸</h1>
        <ThemeToggle />
      </div>
      {components.map((component, index) => (
        <section key={component.name} className="border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-semibold">{component.name}</h2>
          <p className="text-muted-foreground">{component.description}</p>
          <div className="space-y-2">
            <label htmlFor={`prompt-${index}`} className="block text-sm font-medium">
              Enter a prompt for the {component.name}:
            </label>
            <Input
              id={`prompt-${index}`}
              value={prompts[index]}
              onChange={(e) => handlePromptChange(index, e.target.value)}
              placeholder={`Enter text for ${component.name}`}
            />
          </div>
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Generated Code:</h3>
            <pre className="bg-muted p-4 rounded-md overflow-x-auto">
              <code>{component.generateCode(prompts[index] || `Example ${component.name}`)}</code>
            </pre>
          </div>
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Preview:</h3>
            <div className="border border-border p-4 rounded-md">
              {component.preview(prompts[index] || `Example ${component.name}`)}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}