import { Box, Container,Link } from "@material-ui/core";
import { Routes, Route, Router, useParams, Navigate } from "react-router";
import useColabNode from "../hooks/useColabNode";
import ResultViewer from "./ResultViewer";
import Creator from "./Create";
import Home from "./Home";
import { BrowserRouter } from "react-router-dom";
import React, { cloneElement } from "react";
import NodeViewer from "./NodeViewer";
import Footer from "../components/footer";
import AppBar from "../components/AppBar";
import Debug from "debug";
import useIPFS from "../hooks/useIPFS";

const debug = Debug("AppContainer");


export const AppContainer = () => {

    const node = useColabNode();
    debug("got colab node info", node);
    
    return (<><BrowserRouter>
        {/* Nav Bar     */}
        <AppBar/>
        {/* Children that get IPFS state */}
        <Container maxWidth="md" >
            <Routes>
                <Route path='n/:nodeID' element={<NodeViewer {...node} />} />
                <Route path='p/:contentID/*' element={<ModelRoutes node={node} />} />
                <Route path='/*' element={<HomeWithData />} />
            </Routes>
            <More/>
        </Container>

        <Footer {...node}/>
    </BrowserRouter></>);
}

const HomeWithData =() => {
    const params = useParams();
    const path = params["*"];
    const ipfs = useIPFS("/ipns/k51qzi5uqu5dhpj5q7ya9le4ru112fzlx9x1jk2k68069wmuy6gps5i4nc8888" + path);
    debug("home ipfs",ipfs);
    return <Home ipfs={ipfs} />;
};

const ModelRoutes = ({node}) => {
    const { contentID } = useParams();
    const ipfs = useIPFS(contentID);
    const metadata ={};// getMetadata(ipfs);
    return (
        <Routes>
            <Route index element={<Navigate replace to="view" />} />
            <Route path='view' element={<ResultViewer ipfs={ipfs} metadata={metadata} />} />
            <Route path='create' element={<Creator ipfs={ipfs} metadata={metadata} node={node} />} />
        </Routes>
       
    );
}

const More = () => <div style={{margin: '1em auto 4em auto'}}>
  Discuss, get help and contribute on 
  <Link href="https://github.com/pollinations/pollinations/discussions" target="_blank"> [ Github ] </Link>  
  or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
</div>