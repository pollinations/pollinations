import React from "react";
import Model from "./pages/Model";
import Home from "./pages/Home";

export let getRoutes = async () => { 
    return [
        {
            exact: false,
            path: '/p/:hash',
            children: <Model />,
        },
        { 
            exact: true,
            path: "/",
            children: <Home />,
        }
    ];
};
