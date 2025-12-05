import { useState } from "react";
import {
    usePollinationsChat,
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
import { Copy, Send, Loader2, RotateCcw } from "lucide-react";

export function ChatDemo() {
    const [systemMessage, setSystemMessage] = useState(
        "You are a helpful AI assistant."
    );
    const [seed, setSeed] = useState(42);
    const [model, setModel] = useState("openai");
    const [input, setInput] = useState("");

    const { models, isLoading: modelsLoading } = usePollinationsModels("text");
    const { sendMessage, messages, isLoading, reset } = usePollinationsChat(
        [{ role: "system", content: systemMessage }],
        { seed, model, apiKey: API_KEY }
    );

    const handleSend = () => {
        if (input.trim()) {
            sendMessage(input);
            setInput("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const codeExample = `import { usePollinationsChat } from "@pollinations/react";

const { sendMessage, messages, isLoading, reset } = usePollinationsChat(
  [{ role: "system", content: "${systemMessage}" }],
  { seed: ${seed}, model: "${model}" }
);

// Send a message
sendMessage("Hello!");

// Reset conversation
reset();`;

    const copyCode = () => navigator.clipboard.writeText(codeExample);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Chat</CardTitle>
                <CardDescription>Chat with Pollinations AI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="chatSystemMessage">System Message</Label>
                    <Textarea
                        id="chatSystemMessage"
                        value={systemMessage}
                        onChange={(e) => setSystemMessage(e.target.value)}
                        rows={2}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="chatModel">Model</Label>
                        <Select value={model} onValueChange={setModel}>
                            <SelectTrigger id="chatModel">
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
                        <Label htmlFor="chatSeed">Seed</Label>
                        <Input
                            id="chatSeed"
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            min={1}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Conversation</Label>
                        <Button variant="ghost" size="sm" onClick={reset}>
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset
                        </Button>
                    </div>
                    <div className="rounded-md border bg-muted p-4 h-64 overflow-y-auto space-y-3">
                        {messages
                            .filter((msg) => msg.role !== "system")
                            .map((msg, index) => (
                                <div
                                    key={index}
                                    className={`flex ${
                                        msg.role === "user"
                                            ? "justify-end"
                                            : "justify-start"
                                    }`}
                                >
                                    <div
                                        className={`max-w-[80%] p-3 rounded-lg ${
                                            msg.role === "user"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-secondary-foreground"
                                        }`}
                                    >
                                        <span className="mr-2 text-xs opacity-50">
                                            {msg.role === "user" ? "you" : "ai"}
                                        </span>
                                        <ReactMarkdown className="inline">
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-secondary text-secondary-foreground p-3 rounded-lg">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        rows={2}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
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
