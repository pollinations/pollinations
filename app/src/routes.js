import Model from "./pages/Model";
import { Redirect } from "react-router-dom";

export let routes = [
    {
        exact: false,
        path: '/p/:hash',
        children: <Model />,
    },
    { 
        exact: true,
        path: "/",
        children: <Redirect to="/p/QmYHqPL2trZ8GKMNiJqpDGXXxiKXKHP2t1LjtbA5ZpvQj6" />,
    }
]

// Deep Daze"/p/Qma18Qy5tHzNEK1D7Qwa7UkEzZBWjtStW2s7hDRqJyxJ3g"
// Latent2Visions "/p/QmYHqPL2trZ8GKMNiJqpDGXXxiKXKHP2t1LjtbA5ZpvQj6"
