import { Box, Container,Link } from "@material-ui/core";
import NotebookSelector from "../components/NotebookSelector";
import { Routes, Route, Router, useParams } from "react-router";
import useColabNode from "../network/useColabNode";
import NodeStatus from "../components/NodeStatus";
import ModelViewer from "./ModelViewer";
import Model from "./Model";
import Home from "./Home";
import { BrowserRouter } from "react-router-dom";
import { cloneElement } from "react";

export const AppContainer = () => {

    const {node, publish, contentID} = useColabNode();

    return <BrowserRouter>
        {/* Nav Bar */}
        <NotebookSelector>
            {<NodeStatus {...node} /> }
        </NotebookSelector>
        

        {/* Children that get IPFS state */}
        <Container maxWidth="md">

                <Routes>
                    <Route exact={false} path='p/:contentID' element={<WithParams><ModelViewer /></WithParams>} />
                    <Route exact={false} path='c/:contentID' element={<WithParams><Model connected={node.connected}/></WithParams>} />
                    <Route exact={true} path='/' element={<Home />} />
                </Routes>

        </Container>

        {/* Footer */}
        <Box align="right" fontStyle="italic">
            Discuss, get help and contribute on <Link href="https://github.com/pollinations/pollinations/discussions" target="_blank">[ Github ]</Link> or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
        </Box>
    </BrowserRouter>;
}

function WithParams({ children }) {
    const params = useParams();
    return cloneElement(children, {...params});
  }