import { useState } from "react";
import {
    usePollinationsImage,
    usePollinationsModels,
} from "@pollinations/react";
import { API_KEY } from "@/config";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Copy } from "lucide-react";

export function ImageDemo() {
    const [prompt, setPrompt] = useState(
        "A futuristic city with flying cars and neon lights"
    );
    const [seed, setSeed] = useState(42);
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [model, setModel] = useState("flux");

    const [activePrompt, setActivePrompt] = useState(prompt);
    const [activeOptions, setActiveOptions] = useState({
        seed,
        width,
        height,
        model,
        nologo: true,
        apiKey: API_KEY,
    });

    const { models, isLoading: modelsLoading } = usePollinationsModels("image");
    const imageUrl = usePollinationsImage(activePrompt, activeOptions);

    const handleGenerate = () => {
        setActivePrompt(prompt);
        setActiveOptions({
            seed,
            width,
            height,
            model,
            nologo: true,
            apiKey: API_KEY,
        });
    };

    const codeExample = `import { usePollinationsImage } from "@pollinations/react";

const imageUrl = usePollinationsImage(
  "${prompt}",
  {
    model: "${model}",
    width: ${width},
    height: ${height},
    seed: ${seed},
    nologo: true
  }
);`;

    const copyCode = () => navigator.clipboard.writeText(codeExample);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Image Generation</CardTitle>
                <CardDescription>
                    Generate images using Pollinations API
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="imagePrompt">Prompt</Label>
                    <Textarea
                        id="imagePrompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="imageModel">Model</Label>
                        <Select value={model} onValueChange={setModel}>
                            <SelectTrigger id="imageModel">
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                {modelsLoading ? (
                                    <SelectItem value="flux">
                                        Loading...
                                    </SelectItem>
                                ) : (
                                    models.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="imageSeed">Seed</Label>
                        <Input
                            id="imageSeed"
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            min={1}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="imageWidth">Width</Label>
                        <Input
                            id="imageWidth"
                            type="number"
                            value={width}
                            onChange={(e) => setWidth(Number(e.target.value))}
                            min={64}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="imageHeight">Height</Label>
                        <Input
                            id="imageHeight"
                            type="number"
                            value={height}
                            onChange={(e) => setHeight(Number(e.target.value))}
                            min={64}
                        />
                    </div>
                </div>

                <Button onClick={handleGenerate} className="w-full">
                    Generate
                </Button>

                <div className="space-y-2">
                    <Label>Result</Label>
                    <div className="rounded-md border bg-muted p-4">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Generated image"
                                className="w-full h-auto rounded-md"
                            />
                        ) : (
                            <p className="text-muted-foreground text-center py-8">
                                Click generate to see results
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Code</Label>
                        <Button variant="ghost" size="sm" onClick={copyCode}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    <pre className="rounded-md bg-muted p-4 overflow-x-auto text-sm">
                        <code>{codeExample}</code>
                    </pre>
                </div>
            </CardContent>
        </Card>
    );
}
