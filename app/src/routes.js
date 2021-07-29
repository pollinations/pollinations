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
        children: <Redirect to="/p/QmXJnK2FUHEDjR5aFLYELChU6JqdfSxNsoZpy1yHiMXNoK" />,
    }
]

// guided diffusion https://pollinations.ai/p/Qmf5MVSWnpPz7VmKLGWBvTZYPE8hqDE4WRy9YCNXAizEY8