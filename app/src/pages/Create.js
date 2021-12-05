import React, { useCallback, useMemo } from "react"
import Markdown from 'markdown-to-jsx'
import Debug from "debug";

import { getNotebookMetadata } from "../utils/notebookMetadata"
import useIPFSWrite from "../hooks/useIPFSWrite"

import Typography from "@material-ui/core/Typography"
import Box from "@material-ui/core/Box"
import Alert from '@material-ui/lab/Alert'

import FormView from '../components/Form'
import ImageViewer from '../components/MediaViewer'
import { SEO } from "../components/Helmet";
import { SocialPostStatus } from "../components/Social";
import Acordion from "../components/Acordion";
import NotebookTitle from "../components/NotebookTitle";
import { Button, Grid, Paper } from "@material-ui/core";

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

        {/* just in case */}
            {/* inputs */}
           
          {
             !connected && <Alert severity="info">The inputs are <b>disabled</b> because <b>no Colab node is running</b>! Click on <b>LAUNCH</b> (bottom right) or refer to INSTRUCTIONS for further instructions.</Alert>
          }
          <Grid container spacing={{ xs: 12, md: 5, sm:2 }} columns={{ xs: 2, sm: 2, md: 1 }}>
              <Grid md={6}>
              <NotebookTitle metadata={metadata} /> 
                <FormView
                  input={ipfs?.input}
                  connected={connected}
                  metadata={metadata}
                  onSubmit={dispatchForm}
                  onCancel={cancelForm}
                />
              </Grid>

        <Grid xs={12} md={6} align="right">
     
        <NotebookDescription metadata={metadata}/>

        </Grid>
        </Grid>
        



        {/* previews */}
        {ipfs.output && <div >
          <ImageViewer output={ipfs.output} contentID={contentID} />
        </div>
        }

      </Box>
  </>
});



// Notebook Description

const NotebookDescription = ( { metadata } ) => {
  if (metadata === null) return null
  return (
    <Box maxWidth="70%">
    <Paper variant="outlined" elevation={0} >
      <Box m={2}>
      <Typography variant="h6" gutterBottom>Explanation</Typography>
      <Typography color="textSecondary" style={{fontSize:"90%"}} >
        <Markdown children={metadata.description}/>
      </Typography>
      </Box>
      </Paper>
      </Box>  
  );
}


