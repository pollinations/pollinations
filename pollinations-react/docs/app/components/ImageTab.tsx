import { usePollinationsImage } from "@pollinations/react";
import { Copy } from "lucide-react";
import { useState } from "react";
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

export default function ImageGenerationForm() {
    const { imageModels } = useFetchModels();
    const [selectedImageModel, setSelectedImageModel] = useState<string>(
        imageModels[0] || "flux",
    );
    const [imagePrompt, setImagePrompt] = useState(
        "A futuristic city with flying cars and neon lights",
    );
    const [imageSeed, setImageSeed] = useState<number>(42);
    const [imageWidth, setImageWidth] = useState<number>(1024);
    const [imageHeight, setImageHeight] = useState<number>(1024);

    // Add states for the actual values that will be used for generation
    const [activePrompt, setActivePrompt] = useState(imagePrompt);
    const [activeSettings, setActiveSettings] = useState({
        width: imageWidth,
        height: imageHeight,
        seed: imageSeed,
        model: selectedImageModel,
        nologo: true,
    });

    const imageUrl = usePollinationsImage(activePrompt, activeSettings);

    const handleApplyChanges = () => {
        setActivePrompt(imagePrompt);
        setActiveSettings({
            width: imageWidth,
            height: imageHeight,
            seed: imageSeed,
            model: selectedImageModel,
            nologo: true,
        });
    };

    const getImageCode = (): string => {
        const _imageUrlWithParams = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=${imageWidth}&height=${imageHeight}&seed=${imageSeed}&model=${selectedImageModel}&nologo=true`;

        return `
import React from 'react';
import { usePollinationsImage } from '@pollinations/react';

const ImageComponent = () => {
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
    `;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                // You can add a toast notification here if you want
                console.log("Code copied to clipboard");
            })
            .catch((err) => {
                console.error("Failed to copy code: ", err);
            });
    };

    return (
        <Card className="bg-slate-800 text-slate-100">
            <CardHeader>
                <CardTitle>Image Generation</CardTitle>
                <CardDescription>
                    Generate images using Pollinations' API
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="space-y-4"
                    onSubmit={(e) => e.preventDefault()}
                >
                    <div>
                        <Label htmlFor="imagePrompt">Prompt</Label>
                        <Textarea
                            id="imagePrompt"
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                            className="w-full bg-slate-700 text-slate-100"
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <Label htmlFor="imageModel">Model</Label>
                            <Select
                                value={selectedImageModel}
                                onValueChange={setSelectedImageModel}
                            >
                                <SelectTrigger
                                    id="imageModel"
                                    className="bg-slate-700 text-slate-100"
                                >
                                    <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-700 text-slate-100">
                                    {imageModels.map((model) => (
                                        <SelectItem key={model} value={model}>
                                            {model}
                                        </SelectItem>
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
                                onChange={(e) =>
                                    setImageSeed(
                                        Math.max(1, Number(e.target.value)),
                                    )
                                }
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
                                onChange={(e) =>
                                    setImageWidth(
                                        Math.max(32, Number(e.target.value)),
                                    )
                                }
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
                                onChange={(e) =>
                                    setImageHeight(
                                        Math.max(32, Number(e.target.value)),
                                    )
                                }
                                min={32}
                                className="bg-slate-700 text-slate-100"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            onClick={handleApplyChanges}
                            className="bg-blue-500 hover:bg-blue-600 transition-colors"
                        >
                            Apply Changes
                        </Button>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-2">
                            Generated Image:
                        </h3>
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
                        <h3 className="text-lg font-semibold mb-2">
                            Code Preview:
                        </h3>
                        <div className="relative">
                            <SyntaxHighlighter
                                language="typescript"
                                style={oneDark}
                                className="rounded-md"
                            >
                                {getImageCode()}
                            </SyntaxHighlighter>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => copyToClipboard(getImageCode())}
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
