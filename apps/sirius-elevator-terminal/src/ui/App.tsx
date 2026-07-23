// Root component: gate on a stored API key, otherwise run device login, then
// hand off to the game.

import { useState } from "react";
import { Game } from "./Game.js";
import { Login } from "./Login.js";

type AppProps = { initialApiKey: string | null; model: string };

export function App({ initialApiKey, model }: AppProps) {
    const [apiKey, setApiKey] = useState<string | null>(initialApiKey);

    if (!apiKey) {
        return <Login onAuthenticated={setApiKey} />;
    }
    return <Game apiKey={apiKey} model={model} />;
}
