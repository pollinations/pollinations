import React, { useState } from 'react';
import { usePollinationsText } from '@pollinations/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy } from 'lucide-react';

interface TextModel {
  name: string;
  type: 'chat' | 'completion';
  censored: boolean;
}

interface TextTabProps {
  textModels: TextModel[];
  selectedTextModel: string;
  setSelectedTextModel: (model: string) => void;
}

const TextTab: React.FC<TextTabProps> = ({ textModels, selectedTextModel, setSelectedTextModel }) => {
  const [textPrompt, setTextPrompt] = useState("Write a haiku about artificial intelligence");
  const [textSeed, setTextSeed] = useState<number>(42);

  const textResult = usePollinationsText(textPrompt, {
    seed: textSeed,
    model: selectedTextModel
  });

  const getTextCode = (): string => {
    return `
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
    `;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
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
            <div className="relative">
              <SyntaxHighlighter language="typescript" style={oneDark} className="rounded-md">
                {getTextCode()}
              </SyntaxHighlighter>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(getTextCode())}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TextTab;
