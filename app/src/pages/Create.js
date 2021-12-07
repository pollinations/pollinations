import React, { useCallback, useMemo } from "react"
import Markdown from 'markdown-to-jsx'
import Debug from "debug";

import { getNotebookMetadata } from "../utils/notebookMetadata"
import useIPFSWrite from "../hooks/useIPFSWrite"

import Typography from "@material-ui/core/Typography"
import Box from "@material-ui/core/Box"
import Alert from '@material-ui/lab/Alert'

import FormView from '../components/Form'
import MediaViewer from '../components/MediaViewer'
import { SEO } from "../components/Helmet";
import { SocialPostStatus } from "../components/Social";
import Acordion from "../components/Acordion";
import NotebookTitle from "../components/NotebookTitle";

const debug = Debug("Model");

export default React.memo(function Create({ ipfs, node, onSubmit }) {

  const contentID = ipfs[".cid"]
  
  const { connected } = node

  const dispatchInput = useIPFSWrite(ipfs, node)

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input])

  const dispatchForm = useCallback(async inputs => {
    debug("dispatchForm", inputs);
    const contentID = await dispatchInput({
      ...(ipfs?.input || {}),
      ...inputs
    });
    onSubmit(contentID);
    debug("dispatched Form");

  }, [ipfs?.input]);

  const cancelForm = useCallback(() => dispatchInput({ ...ipfs.input, formAction: "cancel" }), [ipfs?.input]);

  debug("ipfs state before rendering model", ipfs)


  return <>
      <Box my={2}>

        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>
        {/* control panel */}
        <NotebookTitle metadata={metadata} />
        {/* just in case */}
        <NotebookDescription metadata={metadata}/>
        

        {/* inputs */}
        <div style={{ width: '100%' }}>
          {
             !connected && <Alert severity="info">The inputs are <b>disabled</b> because <b>no Colab node is running</b>! Click on <b>LAUNCH</b> (bottom right) or refer to INSTRUCTIONS for further instructions.</Alert>
          }
          <FormView
            input={ipfs?.input}
            connected={connected}
            metadata={metadata}
            onSubmit={dispatchForm}
            onCancel={cancelForm}
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

const NotebookDescription = ( { metadata } ) => {
  if (metadata === null) return null
  return (
  <Acordion visibleContent='Details'
    hiddenContent={
      <Typography color="textSecondary">
        <Markdown children={metadata.description}/>
      </Typography>}
  />);
}


