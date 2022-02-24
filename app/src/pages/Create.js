import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Alert from '@material-ui/lab/Alert';
import Debug from "debug";
import Markdown from 'markdown-to-jsx';
import React, { useCallback, useMemo } from "react";
import FormView from '../components/Form';
import { SEO } from "../components/Helmet";
import MediaViewer from '../components/MediaViewer';
import NotebookTitle from "../components/NotebookTitle";
import { getNotebookMetadata } from "../utils/notebookMetadata";
import styled from '@emotion/styled'



const debug = Debug("Create");

export default React.memo(function Create({ ipfs, node, dispatch }) {

  const contentID = ipfs[".cid"]

  const { connected } = node

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input])

  debug("Create", { ipfs, node, metadata })

  const cancelForm = useCallback(() => dispatchInput({ ...ipfs.input, formAction: "cancel" }), [ipfs?.input]);

  debug("ipfs state before rendering model", ipfs)


  return <Box my={2}>

      <SEO metadata={metadata} ipfs={ipfs} cid={contentID} />
      <NotebookTitle name={metadata?.name} />
      <AlertMessage connected={connected}/>
      
      <TwoColumns>

        {/* FORM INPUTS */}
        <div style={{ width: '100%' }}>
          <Typography variant="h5" gutterBottom>
            Inputs
          </Typography>

          <FormView
            input={ipfs?.input}
            connected={connected}
            metadata={metadata}
            onSubmit={dispatch}
          />
        </div>      

        {/* PREVIEWS OR DESCRIPTION? */}
        { ipfs.output ? <div >
          <MediaViewer output={ipfs.output} contentID={contentID} />
          </div> : <NotebookDescription metadata={metadata} />
        }

      </TwoColumns>
    </Box>
});

const TwoColumns = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 4em;

width: 100%;
margin-top: 1em;
`



// Notebook Description

const NotebookDescription = ({ metadata }) => {
  if (metadata === null) return <></>
  return <Box >
    <Typography variant="h5" gutterBottom>
        Details
    </Typography>
    <Typography color="textSecondary">
      <Markdown children={metadata.description} />
    </Typography>
  </Box>
}


// Alert Message

const AlertMessage = ({ connected }) => {
  if (connected) return <></>
  return <Alert severity="info">
    The inputs are <b>disabled</b> because <b>no Colab node is running</b>
    ! Click on <b>LAUNCH</b> (bottom right) or refer to INSTRUCTIONS for further instructions.
  </Alert>
}


