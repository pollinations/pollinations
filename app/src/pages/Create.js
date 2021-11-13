import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Container, Link, Paper, Typography } from "@material-ui/core";
import Alert from '@material-ui/lab/Alert';
import Markdown from 'markdown-to-jsx';

import readMetadata, { getNotebookMetadata } from "../utils/notebookMetadata";
import Debug from "debug";


// Components
import FormView from '../components/Form'
import ImageViewer, { getCoverImage } from '../components/MediaViewer'
import { SEO } from "../components/Helmet";
import { SocialPostStatus } from "../components/Social";
import Acordion from "../components/Acordion";
import useIPFSWrite from "../hooks/useIPFSWrite";
import NotebookTitle from "../components/NotebookTitle";
import { useNavigate } from "react-router";

const debug = Debug("Model");


export default React.memo(function Create({ ipfs, node }) {

  const contentID = ipfs[".cid"];
  
  const { connected } = node;

  const navigate = useNavigate();
  //let { ipfs, nodeID, status, contentID, dispatchInput } = state;
  const dispatchInput = useIPFSWrite(ipfs, node);

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input]);


  const dispatchForm = useCallback(async inputs => {
    debug("dispatchForm", inputs);
    await dispatchInput({
      ...(ipfs?.input || {}),
      ...inputs
    });
    debug("dispatched Form");

    navigate(`/n/${node.nodeID}`);
  
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
             !connected && <Alert severity="info">The inputs are <b>disabled</b> because <b>no Colab node is running</b>! Click on <b>LAUNCH</b> (top right) or refer to INSTRUCTIONS for further instructions.</Alert>
          }
          <FormView
            input={ipfs?.input}
            connected={connected}
            //colabState={ipfs?.output?.status}
            metadata={metadata}
            onSubmit={dispatchForm}
            onCancel={cancelForm}
          />
        </div>
        {
          ipfs?.output?.social &&
          (<div style={{ width: '100%' }}>
            <h3>Social</h3>
            <br />
            <SocialPostStatus results={ipfs?.output?.social} />
          </div>)
        }

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
  <Acordion visibleContent='Details'
    hiddenContent={
      <Typography color="textSecondary">
        <Markdown children={metadata.description}/>
      </Typography>}
  />);
}


