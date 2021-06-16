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
        children: <Redirect to="/p/QmNxqEhzvm4g8EjhmzRPLd6t3jrZehHssF4cUR3JRytDrv"/>
    }
    //
    // Private here with if clause...
    /////////////////////////////////
]