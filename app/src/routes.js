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
        children: <Redirect to="/p/QmbmP9eL3zZAZ2BHPt74MWwTDzrxYetx88i2YLTTGvsVGk" />,
    }
]
