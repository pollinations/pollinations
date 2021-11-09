import { Box, Container,Link } from "@material-ui/core";
import NotebookSelector from "../components/NotebookSelector";
import { Routes, Route, Router, useParams } from "react-router";
import useColabNode from "../hooks/useColabNode";
import NodeStatus from "../components/NodeStatus";
import ModelViewer from "./ResultViewer";
import Model from "./Create";
import Home from "./Home";
import { BrowserRouter } from "react-router-dom";
import { cloneElement } from "react";
import NodeViewer from "./NodeViewer";
import Footer from "../components/footer";

export const AppContainer = () => {

    const node = useColabNode();

    return <BrowserRouter>
        {/* Nav Bar     */}
        <NotebookSelector>
            <NodeStatus {...node} /> 
        </NotebookSelector>
        
        {/* Children that get IPFS state */}
        <Container maxWidth="md">

                <Routes>
                    <Route exact path='n' element={<WithParams><NodeViewer {...node} /></WithParams>} />
                    <Route path='p/:contentID' element={<WithParams><ModelViewer /></WithParams>} />
                    <Route path='c/:contentID' element={<WithParams><Model node={node} /></WithParams>} />
                    <Route exact path='/' element={<Home />} />
                </Routes>

        </Container>

        {/* Footer */}
        <Footer/>
    </BrowserRouter>;
}

function WithParams({ children }) {
    const params = useParams();
    return cloneElement(children, {...params});
  }