import { Box, Link } from "@material-ui/core";
import React from "react";
import NotebookSelector from "../components/NotebookSelector";
import useColab from "../network/useColab";
import Debug from "debug";

const debug = Debug("AppContainer");

export const AppContainer = ({ Page }) => {

    console.error("need to pass in whether to update hash somehow to useColab")
    const { state, dispatch} = useColab(() => true);


    return <>
        {/* Nav Bar */}
        <NotebookSelector {...state} />

        {/* Children that get IPFS state */}
        { <Page {...state} dispatchInput={dispatch} /> }

        {/* Footer */}
        <Box align="right" fontStyle="italic">
            Discuss, get help and contribute on <Link href="https://github.com/pollinations/pollinations/discussions">[ Github ]</Link> or <Link href="https://discord.gg/jgH9y2p7" target="_blank">[ Discord ]</Link>.
        </Box>
    </>;
}