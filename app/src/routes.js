import Model from "./pages/Model";

export let routes = [
    {
        exact: false,
        path: '/:hash',
        children: <Model />,
    },
    //
    // Private here with if clause...
    /////////////////////////////////
]