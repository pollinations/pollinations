import Container from "@material-ui/core/Container"
import Link from '@material-ui/core/Link'
import Debug from "debug"
import { useCallback, useEffect } from "react"
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router"
import { BrowserRouter } from "react-router-dom"
import AppBar from "./components/AppBar"
import ToolBar from "./components/ToolBar"
import useColabNode from "./hooks/useColabNode"
import useIPFS from "./hooks/useIPFS"
import useIPFSWrite from "./hooks/useIPFSWrite"
import useLocalPollens from "./hooks/useLocalPollens"
import About from "./pages/About"
import BlankMarkdown from "./pages/BlankMarkdown"
import ChristmasSpecial from "./pages/ChristmaSpecial"
import Creator from "./pages/Create"
import Feed from "./pages/Feed"
import Help from "./pages/Help"
import Home from "./pages/Home"
import ResultViewer from "./pages/ResultViewer"







const debug = Debug("AppContainer");

const App = () => (
    <BrowserRouter>
        <Pollinations />
    </BrowserRouter>
)

const Pollinations = () => {
    const { node, overrideContentID, overrideNodeID } = useColabNode();
    debug("got colab node info", node);

    const navigate = useNavigate()



    // temporary way of getting around done state
    const { pushCID } = useLocalPollens(node)
    const ipfs = useIPFS(node.contentID);
    useEffect(()=>{
        if (ipfs?.output?.done) {
            pushCID(ipfs[".cid"])
        }
    },[ipfs?.output?.done])




    const navigateToNode = useCallback((contentID) => {
        if (contentID)
            overrideContentID(contentID)
        if (node.nodeID)
            navigate(`/n/${node.nodeID}`)
        else {
            // history.go(0)
            console.error("For some reason NodeID is not set...", node)
        }
    }, [node.nodeID])

    return (<>
        {/* Nav Bar     */}
        <AppBar />
        {/* Children that get IPFS state */}
        <Container maxWidth='lg'>
            <Routes>
                <Route exact path='feed' element={<Feed />} />
                <Route exact path='help' element={<Help/>}/>
                <Route exact path='about' element={<About/>}/>
                <Route exact path='blankMarkdown' element={<BlankMarkdown/>}/>
                <Route exact path='localpollens' element={<LocalPollens node={node}/>}/>
                <Route exact path='christmas' element={<ChristmasSpecial/>}/>

                <Route path='n/:nodeID' element={<NodeWithData node={node} overrideNodeID={overrideNodeID} />} />
                <Route path='p/:contentID/*' element={<ModelRoutes node={node} navigateToNode={navigateToNode} />} />
                <Route path='c/:selected' element={<HomeWithData />} />
                <Route index element={<Navigate replace to="c/Anything" />} />
            </Routes>
            <More />
        </Container>

        <ToolBar node={node} showNode={navigateToNode} />
    </>)
}

const HomeWithData = () => {
    const ipfs = useIPFS("/ipns/k51qzi5uqu5dk56owjc245w1z3i5kgzn1rq6ly6n152iw00px6zx2vv4uzkkh9");

    debug("home ipfs", ipfs);

    return <Home ipfs={ipfs} />
}

const NodeWithData = ({ node, overrideNodeID }) => {
    const ipfs = useIPFS(node.contentID);
    const { nodeID } = useParams();

    useEffect(() => {
        if (nodeID)
            overrideNodeID(nodeID)
    }, [nodeID])

    if (ipfs?.output?.done) {
        // pushCID(ipfs[".cid"])
        return <Navigate to={`/p/${ipfs[".cid"]}`} />
    }

    return <ResultViewer ipfs={ipfs} />
}

const ModelRoutes = ({ node, navigateToNode }) => {
    const { contentID } = useParams();

    const ipfs = useIPFS(contentID);


    const dispatchInput = useIPFSWrite(ipfs, node)

    const dispatch = useCallback(async inputs => {
        debug("dispatching inputs", inputs)
        const contentID = await dispatchInput(inputs)
        debug("dispatched Form")
        navigateToNode(contentID)
    }, [ipfs?.input, node])

    return (
        <Routes>
            <Route index element={<Navigate replace to="view" />} />
            <Route path='view' element={<ResultViewer ipfs={ipfs} />} />
            <Route path='create' element={<Creator ipfs={ipfs} node={node} dispatch={dispatch} />} />
        </Routes>
    )
}

const More = () => <div style={{ margin: '1em auto 4em auto' }}>
    Discuss, get help and contribute on
    <Link href="https://github.com/pollinations/pollinations" target="_blank"> [ Github ] </Link>
    or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
</div>

export default App;