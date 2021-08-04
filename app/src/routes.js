import Model from "./pages/Model";
import { Redirect } from "react-router-dom";
import { defaultNotebook } from "./data/notebooks.js";

export let routes = [
    {
        exact: false,
        path: '/p/:hash',
        children: <Model />,
    },
    { 
        exact: true,
        path: "/",
        children: <Redirect to={defaultNotebook.path} />,
    }
]
