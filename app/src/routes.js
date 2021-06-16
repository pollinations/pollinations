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
        children: <Redirect to="/p/QmSRD9uwgPYGhYDA52cwsP1VPgYRSPC6piXfph6QKRBSR5"/>
    }
    //
    // Private here with if clause...
    /////////////////////////////////
]