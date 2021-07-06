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
        children: <Redirect to="/p/QmRPKXyYzAeFvVo5u8dNzMENKfjBJgAfVAnmnZv6yq85NF" />,
    }
]

// Deep Daze"/p/Qma18Qy5tHzNEK1D7Qwa7UkEzZBWjtStW2s7hDRqJyxJ3g"
// Latent2Visions "/p/QmRPKXyYzAeFvVo5u8dNzMENKfjBJgAfVAnmnZv6yq85NF"
