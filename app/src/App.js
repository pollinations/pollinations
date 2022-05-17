import Container from "@material-ui/core/Container"
import awaitSleep from "await-sleep"
import Debug from "debug"
import { useCallback, useEffect } from "react"
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router"
import { BrowserRouter } from "react-router-dom"
// Components
import ToolBar from "./components/ToolBar"
import TopBar from "./components/TopBar"
import Footer from "./components/Footer"

// Hooks
import useColabNode from "./hooks/useColabNode"
import useIPFS from "./hooks/useIPFS"
import useIPFSWrite from "./hooks/useIPFSInputWrite"
import usePollenDone from "./hooks/usePollenDone"
// Pages
import About from "./pages/About"
import Creator from "./pages/Create"
import Feed from "./pages/Feed"
import Help from "./pages/Help"
import Home from "./pages/Home"
import Impressum from "./pages/Impressum"
import LocalPollens from "./pages/LocalPollens"
import ResultViewer from "./pages/ResultViewer"

const debug = Debug("AppContainer")

const ROUTES = {
  about: { children: "about", to: "/about" },
  feed: { children: "feed", to: "/feed" },
  help: { children: "help", to: "/help" },
  imprint: { children: "impressum", to: "/impressum" },
  myPollens: { children: "my pollens", to: "/localpollens" },
  // expo: { children: "made with pollinations", to: "/expo" },
}

const App = () => (
  <BrowserRouter>
    <Pollinations />
  </BrowserRouter>
)

const Pollinations = () => {
  const { node, overrideContentID, overrideNodeID } = useColabNode()
  debug("got colab node info", node)

  const navigate = useNavigate()

  // to save pollens since we are not necessarily on the localpollens page
  // useLocalPollens(node)

  const navigateToNode = useCallback(() => {
    if (node.nodeID) navigate(`/n/${node.nodeID}`)
    else {
      console.error("For some reason NodeID is not set...", node)
    }
  }, [node.nodeID])

  return (
    <>
      {/* Nav Bar     */}
      {/* <AppBar /> */}
      <TopBar node={node} showNode={navigateToNode} navRoutes={ROUTES} />

      {/* Children that get IPFS state */}
      <Container maxWidth="lg">
        <Routes>
          <Route exact path={ROUTES.feed.to} element={<Feed />} />
          <Route exact path={ROUTES.help.to} element={<Help />} />
          <Route exact path={ROUTES.about.to} element={<About />} />
          <Route exact path={ROUTES.imprint.to} element={<Impressum />} />

          <Route exact path={ROUTES.myPollens.to} element={<LocalPollens node={node} />} />
          <Route exact path={ROUTES.myPollens.to} element={<LocalPollens node={node} />} />
          {/* <Route exact path={ROUTES.expo.to} element={<ExpoPage />} /> */}
          {/* <Route exact path={ROUTES.expo.to + "/:expoId"} element={<ExpoItemPage />} /> */}

          <Route path="c/:selected" element={<Home />} />

          <Route
            path="n/:nodeID"
            element={<NodeWithData node={node} overrideNodeID={overrideNodeID} />}
          />
          <Route
            path="p/:contentID/*"
            element={
              <ModelRoutes
                node={node}
                navigateToNode={navigateToNode}
                overrideContentID={overrideContentID}
              />
            }
          />
          <Route index element={<Navigate replace to="c/Anything" />} />
        </Routes>
        <Footer />
      </Container>

      <ToolBar node={node} showNode={navigateToNode} />
    </>
  )
}

const NodeWithData = ({ node, overrideNodeID }) => {
  const ipfs = useIPFS(node.contentID)
  const { nodeID } = useParams()
  const navigateTo = useNavigate()
  useEffect(() => {
    if (nodeID) overrideNodeID(nodeID)
  }, [nodeID])

  const done = usePollenDone(ipfs)
  useEffect(() => {
    if (done) {
      ;(async () => {
        await awaitSleep(300)
        navigateTo(`/p/${ipfs[".cid"]}`)
      })()
    }
  }, [done, ipfs, navigateTo])

  return <ResultViewer ipfs={ipfs} />
}

const ModelRoutes = ({ node, navigateToNode, overrideContentID }) => {
  const { contentID } = useParams()

  const ipfs = useIPFS(contentID)

  const dispatchInput = useIPFSWrite(ipfs, node)

  const dispatch = useCallback(
    async (inputs) => {
      debug("dispatching inputs", inputs)
      const contentID = await dispatchInput(inputs)
      debug("dispatched Form")
      if (overrideContentID) overrideContentID(contentID)
      navigateToNode()
    },
    [ipfs?.input, dispatchInput]
  )

  return (
    <Routes>
      <Route index element={<Navigate replace to="view" />} />
      <Route path="view" element={<ResultViewer ipfs={ipfs} />} />
      <Route path="create" element={<Creator ipfs={ipfs} node={node} dispatch={dispatch} />} />
    </Routes>
  )
}

export default App
