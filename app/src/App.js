import Container from "@material-ui/core/Container"
import awaitSleep from "await-sleep"
import Debug from "debug"
import { useCallback, useEffect } from "react"
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router"
import { BrowserRouter } from "react-router-dom"
import styled from '@emotion/styled'
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
import Creator from "./pages/Create"
import Feed from "./pages/Feed"
import Home from "./pages/Home"
import ResultViewer from "./pages/ResultViewer"
import PageTemplate from "./components/PageTemplate"
import Models from "./pages/Models"

const debug = Debug("AppContainer")

const ROUTES = {
  about: { label: "about", to: "/about" },
  feed: { label: "feed", to: "/feed" },
  help: { label: "help", to: "/help" },
  impressum: { label: "impressum", to: "/impressum" },
  models: { label: "create", to: '/c' },
  // integrate: { label: "integrate", to: "/integrate" },
  // myPollens: { label: "my pollens", to: "/localpollens" },
  // expo: { children: "made with pollinations", to: "/expo" },
}
const MAIN_NAV_ROUTES = [
  ROUTES.models,
  ROUTES.about, 
  ROUTES.feed,
  ROUTES.help, 
  // ROUTES.integrate, 
  // ROUTES.myPollens
]
const PAGE_ROUTES = [
  ROUTES.about,
  ROUTES.help,
  ROUTES.impressum,
  // ROUTES.integrate
]

const App = () => (
  <BrowserRouter>
    <Pollinations />
  </BrowserRouter>
)

const Pollinations = () => {
  const { node, overrideContentID, overrideNodeID } = useColabNode()
  debug("got colab node info", node)

  const navigate = useNavigate()

  const navigateToNode = useCallback(() => {
    if (node.nodeID) navigate(`/n/${node.nodeID}`)
    else {
      console.error("For some reason NodeID is not set...", node)
    }
  }, [node.nodeID])

  return ( <>
    <ImgContainer>
      <TopBar node={node} showNode={navigateToNode} navRoutes={MAIN_NAV_ROUTES} />

      {/* Children that get IPFS state */}
        <Routes>
          <Route exact path='/' element={<Home />} />
          <Route exact path={ROUTES.feed.to} element={<Feed />} />
          {
            PAGE_ROUTES.map( route => (
              <Route 
                key={route.label}
                exact
                path={route.to}
                element={<PageTemplate label={route.label} />}
              />
            ))
          }

          {/* <Route exact path={ROUTES.myPollens.to} element={<LocalPollens node={node} />} /> */}
          {/* <Route exact path={ROUTES.expo.to} element={<ExpoPage />} /> */}
          {/* <Route exact path={ROUTES.expo.to + "/:expoId"} element={<ExpoItemPage />} /> */}

          <Route path="c/:selected" element={<Models />} />

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
          <Route exact path='c' element={<Navigate replace to="Anything" />} />
        </Routes>
      
      <Footer />
      </ImgContainer>
      
      <ToolBar node={node} showNode={navigateToNode} />
    </>
  )
}




let temp_link = 'https://media.discordapp.net/attachments/987072685131567135/987511563659382804/a_dark_fantasy_picture_of_synesthesia_stormy_universe_muted_colors_dark_mode_wallpaper_4k_trending_on_artstation.png'
let noise_ale = 'https://cdn.discordapp.com/attachments/915601448635605082/988732499893047326/probabilitydensity.jpg'
let noise_b = 'https://media.discordapp.net/attachments/915601448635605082/988731093966540821/mistmountainsoffire.png'
let carol_link = 'https://media.discordapp.net/attachments/987072685131567135/987854962530848829/holographic-gradient-of-pastel-colors_0.png?width=973&height=973'
let danae_link = 'https://media.discordapp.net/attachments/987072685131567135/987080808659562606/unknown.png'
let danae_linkB = 'https://media.discordapp.net/attachments/986173620512510023/988743677524467712/splash-07.png?width=1459&height=973'
const ImgContainer = styled.div`

  background-image: url(${danae_linkB});
  background-size: cover;
  background-position: center;

  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  // create a :before layer just like the :after layer
  // but with a background-color: rgba(0,0,0,0.5)




  &:after {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 100%;
    background: rgba(0, 0, 0, 0.25);
    //background: linear-gradient(180deg, rgba(77, 120, 169, 0.2) 0%, rgba(211, 230, 146, 0.49) 39.06%, rgba(107, 128, 182, 0.63) 78.12%, #6B96B6 100%);
    z-index:1;
  }
  // select everything and set z-index: 5
  & * {
    z-index: 5;
  }
`






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
