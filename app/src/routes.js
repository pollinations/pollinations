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
        children: <Redirect to="/p/QmWJD1pyKjkkY2hgxAT9CmdwC1xnhs1Ac2mVRm8PiF1qzG" />,
    }
]

// Deep Daze"/p/Qma18Qy5tHzNEK1D7Qwa7UkEzZBWjtStW2s7hDRqJyxJ3g"
// Latent2Visions "/p/QmWJD1pyKjkkY2hgxAT9CmdwC1xnhs1Ac2mVRm8PiF1qzG"
