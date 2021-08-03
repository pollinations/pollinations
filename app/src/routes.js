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
        children: <Redirect to="/p/QmSeaCzpgm3BP1FgEEUXuW5bW7aYRhrbmemdpKENmdu1Yg" />,
    }
]

// CLIP+VQGan /p/QmXJnK2FUHEDjR5aFLYELChU6JqdfSxNsoZpy1yHiMXNoK

// guided diffusion /p/Qma1zZwTYTX5rKoGpyBY4DWCK7ERXGpto4pNKfmHAEFoVM