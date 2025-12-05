import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextDemo } from "@/components/demos/TextDemo";
import { ImageDemo } from "@/components/demos/ImageDemo";
import { ChatDemo } from "@/components/demos/ChatDemo";

export default function App() {
    return (
        <main className="container mx-auto max-w-4xl p-4 py-8">
            <header className="mb-12 text-center">
                <h1 className="text-3xl font-light mb-2 tracking-tight">
                    @pollinations/react
                </h1>
                <p className="text-sm text-muted-foreground">
                    AI generation hooks
                </p>
            </header>

            <Tabs defaultValue="text" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="text">Text</TabsTrigger>
                    <TabsTrigger value="image">Image</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                </TabsList>

                <TabsContent value="text">
                    <TextDemo />
                </TabsContent>

                <TabsContent value="image">
                    <ImageDemo />
                </TabsContent>

                <TabsContent value="chat">
                    <ChatDemo />
                </TabsContent>
            </Tabs>

            <footer className="mt-16 pt-8 border-t text-center text-muted-foreground text-xs">
                <div className="flex justify-center gap-6">
                    <a
                        href="https://pollinations.ai"
                        className="hover:text-foreground"
                    >
                        pollinations.ai
                    </a>
                    <a
                        href="https://github.com/pollinations/pollinations"
                        className="hover:text-foreground"
                    >
                        github
                    </a>
                    <a
                        href="https://www.npmjs.com/package/@pollinations/react"
                        className="hover:text-foreground"
                    >
                        npm
                    </a>
                </div>
            </footer>
        </main>
    );
}
