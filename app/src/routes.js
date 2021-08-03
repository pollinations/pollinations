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
        children: <Redirect to="/p/QmRPjy8qiwy977hFvkx99pBWQNxTHxtfJQ2fxWPVuFHD7W" />,
    }
]
