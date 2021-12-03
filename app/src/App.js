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
import Creator from "./pages/Create"
import Feed from "./pages/Feed"
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

    const navigateToNode = useCallback((contentID) => {
        if (contentID)
            overrideContentID(contentID)
        if (node?.nodeID)
            navigate(`/n/${node.nodeID}`)
        else {
            history.go(0)
            console.error("For some reason NodeID is not set...", node)
        }
    }, [node?.nodeID])

    return (<>
        {/* Nav Bar     */}
        <AppBar />
        {/* Children that get IPFS state */}
        <Container maxWidth='lg'>
            <Routes>
                <Route path='feed' element={<Feed />} />
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
    const ipfs = useIPFS("/ipns/k51qzi5uqu5dgclgti82d70co1fcw7g0xmelek4lwd5t6pcfduk21ddeuseonh");

    debug("home ipfs", ipfs);

    return <Home ipfs={ipfs} />
}

const NodeWithData = ({ node, overrideNodeID }) => {
    const ipfs = useIPFS(node.contentID);
    const { nodeID } = useParams();
    // useEffect(() => {
    //     if (nodeID)
    //         overrideNodeID(nodeID)
    // }, [nodeID])

    if (ipfs?.output?.done) return <Navigate to={`/p/${ipfs[".cid"]}`} />

    return <ResultViewer ipfs={ipfs} />
}

const ModelRoutes = ({ node, navigateToNode }) => {
    const { contentID } = useParams();

    const ipfs = useIPFS(contentID);

    return (
        <Routes>
            <Route index element={<Navigate replace to="view" />} />
            <Route path='view' element={<ResultViewer ipfs={ipfs} />} />
            <Route path='create' element={<Creator ipfs={ipfs} node={node} onSubmit={navigateToNode} />} />
        </Routes>
    )
}

const More = () => <div style={{ margin: '1em auto 4em auto' }}>
    Discuss, get help and contribute on
    <Link href="https://github.com/pollinations/pollinations" target="_blank"> [ Github ] </Link>
    or <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>.
</div>

export default App;