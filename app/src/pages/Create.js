import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Alert from '@material-ui/lab/Alert';
import Debug from "debug";
import Markdown from 'markdown-to-jsx';
import React, { useCallback, useMemo } from "react";
import Acordion from "../components/Acordion";
import FormView from '../components/Form';
import { SEO } from "../components/Helmet";
import MediaViewer from '../components/MediaViewer';
import NotebookTitle from "../components/NotebookTitle";
import { getNotebookMetadata } from "../utils/notebookMetadata";




const debug = Debug("Create");

export default React.memo(function Create({ ipfs, node, dispatch }) {

  const contentID = ipfs[".cid"]

  const { connected } = node

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input])

  debug("Create", { ipfs, node, metadata })

  const cancelForm = useCallback(() => dispatchInput({ ...ipfs.input, formAction: "cancel" }), [ipfs?.input]);

  debug("ipfs state before rendering model", ipfs)


  return <>
    <Box my={2}>

      <SEO metadata={metadata} ipfs={ipfs} cid={contentID} />
      {/* control panel */}
      <NotebookTitle metadata={metadata} />
      {/* just in case */}
      <NotebookDescription metadata={metadata} />


      {/* inputs */}
      <div style={{ width: '100%' }}>
        {
          !connected && <Alert severity="info">The inputs are <b>disabled</b> because <b>no Colab node is running</b>! Click on <b>LAUNCH</b> (bottom right) or refer to INSTRUCTIONS for further instructions.</Alert>
        }
        <FormView
          input={ipfs?.input}
          connected={connected}
          metadata={metadata}
          onSubmit={dispatch}
        />
      </div>

      {/* previews */}
      {ipfs.output && <div >
        <MediaViewer output={ipfs.output} contentID={contentID} />
      </div>
      }

    </Box>
  </>
});



// Notebook Description

const NotebookDescription = ({ metadata }) => {
  if (metadata === null) return null
  return (
    <Acordion visibleContent='Details'
      hiddenContent={
        <Typography color="textSecondary">
          <Markdown children={metadata.description} />
        </Typography>}
    />);
}


