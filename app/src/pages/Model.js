import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Container, Link, Paper, Typography } from "@material-ui/core";
import Alert from '@material-ui/lab/Alert';
import Markdown from 'markdown-to-jsx';

import readMetadata from "../utils/notebookMetadata";
import Debug from "debug";


// Components
import { IpfsLog } from "../components/Logs";
import FormView from '../components/Form'
import ImageViewer, { getCoverImage } from '../components/MediaViewer'
import { SEO } from "../components/Helmet";
import { NotebookProgress } from "../components/NotebookProgress";
import { SocialPostStatus } from "../components/Social";
import useIPFS from "../network/useIPFS";
import Acordion from "../components/Acordion";

const debug = Debug("Model");


export default React.memo(function Model({ contentID, connected }) {
  

  const ipfs = useIPFS(contentID);
  //let { ipfs, nodeID, status, contentID, dispatchInput } = state;

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input]);


  const dispatchForm = useCallback(async inputs => {
    debug("dispatchForm", inputs);
    await dispatchInput({
      ...inputs,
      ["notebook.ipynb"]: ipfs?.input["notebook.ipynb"],
      formAction: "submit"
    });
  debug("dispatched Form");
}, [ipfs?.input]);

  const cancelForm = useCallback(() => dispatchInput({ ...ipfs.input, formAction: "cancel" }), [ipfs?.input]);

  debug("ipfs state before rendering model", ipfs)


  return <>
      <Box my={2}>

        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>
        {/* control panel */}

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
            colabState={ipfs?.output?.status}
            metadata={metadata}
            onSubmit={dispatchForm}
            onCancel={cancelForm}
          />
          <NotebookProgress
            output={ipfs?.output}
            metadata={metadata}
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

        <div style={{ width: '100%' }}>
          <IpfsLog ipfs={ipfs} contentID={contentID} />
        </div>


      </Box>
  </>
});


// function that returns true when the run has finished
// will change URL hash

const isDone = (state) => state?.ipfs?.output?.done;


// for backward compatibility we check if the notebook.ipynb is at / or at /input
// the new "correct" way is to save the notebook.ipynb to /input

const getNotebookMetadata = ipfs => readMetadata((ipfs?.input && ipfs.input["notebook.ipynb"]) || ipfs && ipfs["notebook.ipynb"]);


// Stepper

const steps = [
  {
    title: '1. Connect to Google Colab',
    description: [
      ''
    ]
  }
]

const useStepper = () => {

  return <>
  </>
}








// Notebook Description

const NotebookDescription = ( { metadata } ) => {
  if (metadata === null) return null
  return  <>
  <Typography 
          variant="h5" 
          component="h5" 
          gutterBottom
          children={metadata.name.replace(".ipynb","")}/>
  <Acordion visibleContent='More info about this notebook'
    hiddenContent={
      <Typography color="textSecondary">
        <Markdown children={metadata.description}/>
      </Typography>}
  />
  <Acordion visibleContent='Instructions'
    hiddenContent={
      <Typography color="textSecondary">
        <Instructions/>
      </Typography>}
  />
  </>
}

const Instructions = () => {
  const [ markdown, setMarkdown ] = useState('')

  useEffect(() => { 
    async function getHelp(){
      const response = await fetch("https://raw.githubusercontent.com/pollinations/pollinations/dev/docs/instructions.md");
      const md = await response.text();
      setMarkdown(md);
    }
    getHelp() 
  },[]);

  return <Markdown children={markdown}/>
}
