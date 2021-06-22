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
        children: <Redirect to="/p/Qma18Qy5tHzNEK1D7Qwa7UkEzZBWjtStW2s7hDRqJyxJ3g" />,
    }
]

//"/p/QmNsc2NK1UMMWcshuJebRNH4z5xwkjx9G7R5K266xFZMxV"
