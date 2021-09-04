import Model from "./pages/Model";
import { Redirect } from "react-router-dom";
import { getDefaultNotebook } from "./data/notebooks.js";

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
            children: <Redirect to={(await  getDefaultNotebook())?.path} />,
        }
    ];
};
