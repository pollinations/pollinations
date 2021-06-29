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
        children: <Redirect to="/p/QmTzy3gmsoz5PhxV8amfDRpyxq2LMveCzPfn2xdG6GsiEE" />,
    }
]

// Deep Daze"/p/QmWQB8CGsbqzWXWuwgzAArCTadAGLzq47WAyrDbASpNXCu"
// Latent2Visions "/p/QmTzy3gmsoz5PhxV8amfDRpyxq2LMveCzPfn2xdG6GsiEE"
