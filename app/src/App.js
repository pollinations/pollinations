import Container from "@material-ui/core/Container"
import awaitSleep from "await-sleep"
import Debug from "debug"
import { useCallback, useEffect } from "react"
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router"
import { BrowserRouter } from "react-router-dom"
import Footer from "./components/Footer"
import PageTemplate from "./components/PageTemplate"
// Components
import ToolBar from "./components/ToolBar"
import TopBar from "./components/TopBar"
// Hooks
import useColabNode from "./hooks/useColabNode"
import useIPFS from "./hooks/useIPFS"
import useIPFSWrite from "./hooks/useIPFSInputWrite"
import usePollenDone from "./hooks/usePollenDone"
// Pages
import Creator from "./pages/Create"
import Dalle from "./pages/Dalle"
import Envisioning from "./pages/Envisioning"
import Feed from "./pages/Feed"
import Home from "./pages/Home"
import Models from "./pages/Models"
import ResultViewer from "./pages/ResultViewer"

import ImageContainer from "./components/BackgroundImage"

import { 
  ROUTES, 
  MARKDOWN_ROUTES, 
  MAIN_NAV_ROUTES } from "./routes/publicRoutes"


// import ipfsConnector from "@pollinations/ipfs"

const debug = Debug("AppContainer")
// debug("P",ipfsConnector)


const App = () => (
  <BrowserRouter>
    <Pollinations />
  </BrowserRouter>
)

const Pollinations = () => {
  const { node, overrideContentID, overrideNodeID } = useColabNode()
  debug("got colab node info", node)

  const navigate = useNavigate()

  const navigateToNode = useCallback((nodeID = node.nodeID) => {
    if (nodeID) navigate(`/n/${nodeID}`)
    else {
      console.error("For some reason NodeID is not set...", node)
    }
  }, [node.nodeID])

  return ( <>

      <TopBar node={node} showNode={navigateToNode} navRoutes={MAIN_NAV_ROUTES} />

      {/* Children that get IPFS state */}
        <Routes>
          <Route exact path='/' element={<Home />} />

          <Route exact path={ROUTES.feed.to} element={<Feed />} />
          {
            MARKDOWN_ROUTES.map( route => (
              <Route 
                key={route.label}
                exact
                path={route.to}
                element={<PageTemplate label={route.label} />}
              />
            ))
          }

          <Route path="c/:selected" element={<Models />} />

          <Route path="n/:nodeID"
            element={<NodeWithData node={node} overrideNodeID={overrideNodeID} />}
          />
          <Route
            path="envisioning/:nodeID"
            element={<Envisioning navigateToNode={navigateToNode}/>}
          />
          <Route
            path="envisioning"
            element={<Envisioning navigateToNode={navigateToNode}/>}
          />
          <Route
            path="dalle/:nodeID"
            element={<Dalle navigateToNode={navigateToNode}/>}
          />
          <Route
            path="dalle"
            element={<Dalle navigateToNode={navigateToNode}/>}
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
          <Route exact path='c' element={<Navigate replace to="Anything" />} />
        </Routes>
      
      <Footer />
      <ImageContainer/>
      
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
