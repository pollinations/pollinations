import { usePollinationsText } from "@pollinations/react";
import { Copy } from "lucide-react";
import type React from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFetchModels } from "../hooks/useFetchModels";

interface TextModel {
    name: string;
    type: "chat" | "completion";
    censored: boolean;
}

export default function TextGenerationForm() {
    const [textPrompt, setTextPrompt] = useState(
        "Write a haiku about artificial intelligence",
    );
    const [textSeed, setTextSeed] = useState<number>(42);
    const [selectedTextModel, setSelectedTextModel] =
        useState<string>("openai");
    const { textModels } = useFetchModels();
    const [systemPrompt, setSystemPrompt] = useState<string>(
        "You are a helpful AI assistant.",
    );

    const [activePrompt, setActivePrompt] = useState(textPrompt);
    const [activeSettings, setActiveSettings] = useState({
        seed: textSeed,
        model: selectedTextModel,
        systemPrompt,
    });

    const textResult = usePollinationsText(activePrompt, activeSettings);

    const getTextCode = (): string => {
        return `
import React from 'react';
import { usePollinationsText } from '@pollinations/react';
import ReactMarkdown from 'react-markdown';

const TextComponent = () => {
  const text = usePollinationsText("${textPrompt}", { 
    seed: ${textSeed},
    model: '${selectedTextModel}',
    systemPrompt: "${systemPrompt}"
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
        navigator.clipboard
            .writeText(text)
            .then(() => {
                console.log("Code copied to clipboard");
                // You can add a toast notification here if you want
            })
            .catch((err) => {
                console.error("Failed to copy code: ", err);
            });
    };

    const handleApplyChanges = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setActivePrompt(textPrompt);
        setActiveSettings({
            seed: textSeed,
            model: selectedTextModel,
            systemPrompt,
        });
    };

    return (
        <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
                <CardTitle>Text Generation</CardTitle>
                <CardDescription>
                    Generate text using Pollinations' API
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form className="space-y-4">
                    <div>
                        <Label htmlFor="systemPrompt">System Prompt</Label>
                        <Textarea
                            id="systemPrompt"
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="w-full bg-slate-700 text-slate-100"
                            rows={3}
                        />
                    </div>
                    <div>
                        <Label htmlFor="textPrompt">Prompt</Label>
                        <Textarea
                            id="textPrompt"
                            value={textPrompt}
                            onChange={(e) => setTextPrompt(e.target.value)}
                            className="w-full bg-slate-700 text-slate-100"
                            rows={3}
                        />
                    </div>
                    <div className="flex space-x-4">
                        <div className="flex-1">
                            <Label htmlFor="textModel">Model</Label>
                            <Select
                                value={selectedTextModel}
                                onValueChange={setSelectedTextModel}
                            >
                                <SelectTrigger
                                    id="textModel"
                                    className="bg-slate-700 text-slate-100"
                                >
                                    <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-700 text-slate-100">
                                    {textModels.map((model: TextModel) => (
                                        <SelectItem
                                            key={model.name}
                                            value={model.name}
                                        >
                                            {model.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1">
                            <Label htmlFor="textSeed">Seed</Label>
                            <Input
                                id="textSeed"
                                type="number"
                                value={textSeed}
                                onChange={(e) =>
                                    setTextSeed(
                                        Math.max(1, Number(e.target.value)),
                                    )
                                }
                                min={1}
                                className="bg-slate-700 text-slate-100"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={handleApplyChanges}
                            className="bg-blue-500 hover:bg-blue-600 transition-colors"
                        >
                            Apply Changes
                        </Button>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-2">
                            Generated Text:
                        </h3>
                        <div className="bg-slate-700 p-4 rounded-md">
                            {textResult ? (
                                <ReactMarkdown>{textResult}</ReactMarkdown>
                            ) : (
                                <p>Loading...</p>
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-2">
                            Code Preview:
                        </h3>
                        <div className="relative">
                            <SyntaxHighlighter
                                language="typescript"
                                style={oneDark}
                                className="rounded-md"
                            >
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
                </form>
            </CardContent>
        </Card>
    );
}
