import React from "react";
import Model from "./pages/Model";
import Home from "./pages/Home";

export let getRoutes =  () => { 
    return [
        {
            exact: false,
            path: '/p/:hash*',
            Page: Model,
        },
        { 
            exact: true,
            path: "/",
            Page: Home,
        }
    ];
};
