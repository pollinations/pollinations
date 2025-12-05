import { useState } from "react";
import {
    usePollinationsText,
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
import ReactMarkdown from "react-markdown";
import { Copy, Loader2 } from "lucide-react";

export function TextDemo() {
    const [prompt, setPrompt] = useState(
        "Write a haiku about artificial intelligence"
    );
    const [systemPrompt, setSystemPrompt] = useState(
        "You are a helpful AI assistant."
    );
    const [seed, setSeed] = useState(42);
    const [model, setModel] = useState("openai");

    const [activePrompt, setActivePrompt] = useState(prompt);
    const [activeOptions, setActiveOptions] = useState({
        seed,
        model,
        systemPrompt,
        apiKey: API_KEY,
    });

    const { models, isLoading: modelsLoading } = usePollinationsModels("text");
    const { data, isLoading, error } = usePollinationsText(
        activePrompt,
        activeOptions
    );

    const handleGenerate = () => {
        setActivePrompt(prompt);
        setActiveOptions({ seed, model, systemPrompt, apiKey: API_KEY });
    };

    const codeExample = `import { usePollinationsText } from "@pollinations/react";

const { data, isLoading, error } = usePollinationsText(
  "${prompt}",
  {
    model: "${model}",
    seed: ${seed},
    systemPrompt: "${systemPrompt}"
  }
);`;

    const copyCode = () => navigator.clipboard.writeText(codeExample);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Text Generation</CardTitle>
                <CardDescription>
                    Generate text using Pollinations API
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="systemPrompt">System Prompt</Label>
                    <Textarea
                        id="systemPrompt"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={2}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="prompt">Prompt</Label>
                    <Textarea
                        id="prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        <Select value={model} onValueChange={setModel}>
                            <SelectTrigger id="model">
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                {modelsLoading ? (
                                    <SelectItem value="openai">
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
                        <Label htmlFor="seed">Seed</Label>
                        <Input
                            id="seed"
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            min={1}
                        />
                    </div>
                </div>

                <Button onClick={handleGenerate} className="w-full">
                    {isLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Generate
                </Button>

                <div className="space-y-2">
                    <Label>Result</Label>
                    <div className="rounded-md border bg-muted p-4 min-h-[100px]">
                        {isLoading ? (
                            <p className="text-muted-foreground">
                                Generating...
                            </p>
                        ) : error ? (
                            <p className="text-red-500">{error}</p>
                        ) : data ? (
                            <ReactMarkdown>{data}</ReactMarkdown>
                        ) : (
                            <p className="text-muted-foreground">
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
