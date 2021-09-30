import React, { useEffect, useMemo, useState } from "react";
import { Box, Button, Container, Link, Paper, Typography } from "@material-ui/core";
import Alert from '@material-ui/lab/Alert';
import Markdown from 'markdown-to-jsx';
import GitHubIcon from '@material-ui/icons/GitHub';


import useColab from "../network/useColab"
import readMetadata from "../utils/notebookMetadata";
import HelpModal from "../components/HelpModal";
import Debug from "debug";


// Components
import { IpfsLog } from "../components/Logs";
import FormView from '../components/Form'
import ImageViewer, { getCoverImage } from '../components/MediaViewer'
import NodeStatus from "../components/NodeStatus";
import { SEO } from "../components/Helmet";
import { NotebookProgress } from "../components/NotebookProgress";
import { SocialPostStatus } from "../components/Social";
import NotebookSelector from "../components/NotebookSelector";

const debug = Debug("Model");


export default React.memo(function Model(state) {

  let { ipfs, nodeID, status, contentID, dispatchInput } = state;

  const metadata = getNotebookMetadata(ipfs);

  const dispatchForm = async inputs => {
    debug("dispatchForm", inputs);
    await dispatchInputState({
      ...inputs,
      ["notebook.ipynb"]: ipfs?.input["notebook.ipynb"],
      formAction: "submit"
    });
  debug("dispatched Form");
};

  const cancelForm = () => dispatchInput({ ...ipfs.input, formAction: "cancel" })
  debug("ipfs state before rendering model", ipfs)
  return <>
    <Container maxWidth="md">
      <Box my={2}>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <SEO metadata={metadata} ipfs={ipfs} cid={contentID}/>
        {/* control panel */}

        {/* just in case */}
        {metadata && metadata.description ? 
          <>
              <Typography variant="h5" component="h5" gutterBottom>
                {metadata.name.replace(".ipynb","")}
              </Typography>
              <Markdown>{metadata.description}</Markdown>
          </>
           : null}

        {/* inputs */}
        <div style={{ width: '100%' }}>
          {
            status === "disconnected" && <Alert severity="info">The inputs are <b>disabled</b> because <b>no Colab node is running</b>! Click on <b>LAUNCH</b> (top right) or refer to INSTRUCTIONS for further instructions.</Alert>
          }

          <FormView
            input={ipfs.input}
            status={status}
            colabState={ipfs?.output?.status}
            metadata={metadata}
            nodeID={nodeID}
            onSubmit={dispatchForm}
            onCancel={cancelForm}
          />
          <NotebookProgress
            output={ipfs.output}
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
          <IpfsLog state={state} />
        </div>


      </div>
      </Box>
    </Container>
  </>
});


// function that returns true when the run has finished
// will change URL hash

const isDone = (state) => state?.ipfs?.output?.done;


// for backward compatibility we check if the notebook.ipynb is at / or at /input
// the new "correct" way is to save the notebook.ipynb to /input

const getNotebookMetadata = ipfs => readMetadata((ipfs?.input && ipfs.input["notebook.ipynb"]) || ipfs && ipfs["notebook.ipynb"]);

