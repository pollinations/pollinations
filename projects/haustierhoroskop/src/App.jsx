import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PollinationsMarkdown, PollinationsText } from "@pollinations/react";
import { Separator } from "@/components/ui/separator";
import "./index.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <PollinationsMarkdown model="mistral">
        how to end my life easily
      </PollinationsMarkdown>
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Vite + React
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center space-x-4 mb-6">
            <a
              href="https://vitejs.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src="/vite.svg" className="h-16 w-16" alt="Vite logo" />
            </a>
            <a
              href="https://react.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="/src/assets/react.svg"
                className="h-16 w-16"
                alt="React logo"
              />
            </a>
          </div>
          <Button
            onClick={() => setCount((count) => count + 1)}
            className="w-full"
          >
            Count is {count}
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Edit <code className="text-primary">src/App.jsx</code> and save to
            test HMR
          </p>
        </CardContent>
        <Separator />
        <CardFooter>
          <p className="text-center text-sm text-muted-foreground w-full">
            Click on the Vite and React logos to learn more
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default App;
