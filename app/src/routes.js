import React from "react";
import Model from "./pages/Model";
import Home from "./pages/Home";
import ModelViewer from "./pages/ModelViewer";

export let getRoutes =  () => { 
    return [
        {
            exact: false,
            path: '/p/:hash*',
            Page: ModelViewer,
        },
        {
            exact: false,
            path: '/c/:hash*',
            Page: Model,
        },
        { 
            exact: true,
            path: "/",
            Page: Home,
        }
    ];
};
