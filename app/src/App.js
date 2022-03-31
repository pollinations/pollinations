import Container from '@material-ui/core/Container';
import Link from '@material-ui/core/Link';
import awaitSleep from 'await-sleep';
import Debug from 'debug';
import { useCallback, useEffect } from 'react';
import {
  Navigate, Route, Routes, useNavigate, useParams,
} from 'react-router';
import { BrowserRouter } from 'react-router-dom';
// Components
import ToolBar from './components/ToolBar';
import TopBar from './components/TopBar';
// Hooks
import useColabNode from './hooks/useColabNode';
import useIPFS from './hooks/useIPFS';
import useIPFSWrite from './hooks/useIPFSInputWrite';
import useLocalPollens from './hooks/useLocalPollens';
import usePollenDone from './hooks/usePollenDone';
// Pages
import About from './pages/About';
import Creator from './pages/Create';
import Feed from './pages/Feed';
import Help from './pages/Help';
import Home from './pages/Home';
import LocalPollens from './pages/LocalPollens';
import ResultViewer from './pages/ResultViewer';

const debug = Debug('AppContainer');

function App() {
  return (
    <BrowserRouter>
      <Pollinations />
    </BrowserRouter>
  );
}

function Pollinations() {
  const { node, overrideContentID, overrideNodeID } = useColabNode();
  debug('got colab node info', node);

  const navigate = useNavigate();

  // to save pollens since we are not necessarily on the localpollens page
  useLocalPollens(node);

  const navigateToNode = useCallback(() => {
    if (node.nodeID) navigate(`/n/${node.nodeID}`);
    else {
      console.error('For some reason NodeID is not set...', node);
    }
  }, [node.nodeID]);

  return (
    <>
      {/* Nav Bar     */}
      {/* <AppBar /> */}
      <TopBar node={node} showNode={navigateToNode} />

      {/* Children that get IPFS state */}
      <Container maxWidth="lg">
        <Routes>
          <Route exact path="feed" element={<Feed />} />
          <Route exact path="help" element={<Help />} />
          <Route exact path="about" element={<About />} />

          <Route path="c/:selected" element={<Home />} />
          <Route exact path="localpollens" element={<LocalPollens node={node} />} />

          <Route path="n/:nodeID" element={<NodeWithData node={node} overrideNodeID={overrideNodeID} />} />
          <Route path="p/:contentID/*" element={<ModelRoutes node={node} navigateToNode={navigateToNode} overrideContentID={overrideContentID} />} />
          <Route index element={<Navigate replace to="c/Anything" />} />
        </Routes>
        <More />
      </Container>

      <ToolBar node={node} showNode={navigateToNode} />
    </>
  );
}

function NodeWithData({ node, overrideNodeID }) {
  const ipfs = useIPFS(node.contentID);
  const { nodeID } = useParams();
  const navigateTo = useNavigate();
  useEffect(() => {
    if (nodeID) overrideNodeID(nodeID);
  }, [nodeID]);

  const done = usePollenDone(ipfs);
  useEffect(() => {
    if (done) {
      (async () => {
        await awaitSleep(300);
        navigateTo(`/p/${ipfs['.cid']}`);
      })();
    }
  }, [done, ipfs, navigateTo]);

  return <ResultViewer ipfs={ipfs} />;
}

function ModelRoutes({ node, navigateToNode, overrideContentID }) {
  const { contentID } = useParams();

  const ipfs = useIPFS(contentID);

  const dispatchInput = useIPFSWrite(ipfs, node);

  const dispatch = useCallback(async (inputs) => {
    debug('dispatching inputs', inputs);
    const contentID = await dispatchInput(inputs);
    debug('dispatched Form');
    if (overrideContentID) overrideContentID(contentID);
    navigateToNode();
  }, [ipfs?.input, dispatchInput]);

  return (
    <Routes>
      <Route index element={<Navigate replace to="view" />} />
      <Route path="view" element={<ResultViewer ipfs={ipfs} />} />
      <Route path="create" element={<Creator ipfs={ipfs} node={node} dispatch={dispatch} />} />
    </Routes>
  );
}

function More() {
  return (
    <div style={{ margin: '1em auto 4em auto' }}>
      Discuss, get help and contribute on
      <Link href="https://github.com/pollinations/pollinations" target="_blank"> [ Github ] </Link>
      or
      {' '}
      <Link href="https://discord.gg/XXd99CrkCr" target="_blank">[ Discord ]</Link>
      .
    </div>
  );
}

export default App;
