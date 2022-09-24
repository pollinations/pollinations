import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Alert from '@material-ui/lab/Alert';
import Debug from "debug";
import React, { useCallback, useMemo } from "react";
import NotebookForm from '../components/form/NotebookForm';
import { SEO } from "../components/Helmet";
import { StartHereButton } from '../components/molecules/LaunchColabButton';
import NotebookTitle from "../components/NotebookTitle";
import NotebookInfo from '../components/organisms/markdownParsers/NotebookInfo';
import { getNotebookMetadata } from "../utils/notebookMetadata";
import styled from '@emotion/styled'
import { GlobalSidePadding } from '../styles/global';
import { BaseContainer } from "../styles/global";
import Banner from '../components/Banner';


const debug = Debug("Create");

export default React.memo(function Create({ ipfs, node, dispatch }) {

  const contentID = ipfs[".cid"]

  const { connected } = node

  const metadata = useMemo(() => getNotebookMetadata(ipfs), [ipfs?.input])

  debug("Create", { ipfs, node, metadata })

  const cancelForm = useCallback(() => dispatchInput({ ...ipfs.input, formAction: "cancel" }), [ipfs?.input]);

  debug("ipfs state before rendering model", ipfs)

  return <BaseContainer>

      <SEO metadata={metadata} ipfs={ipfs} cid={contentID} />
      <Banner/>
      <NotebookTitle style={{marginTop: '1em'}}name={metadata?.name.replace('-', ' ').replace('-', ' ').toLowerCase()} />
      <AlertMessage node={node}/>

        <TwoColumns>
          {/* FORM INPUTS */}
          <div>
            <Typography variant="h5" gutterBottom>
              Inputs
            </Typography>

            <NotebookForm
              input={ipfs?.input}
              connected={connected}
              metadata={metadata}
              onSubmit={dispatch}
            />
            
          </div> 

          {/* OUTPUTS */}
          <div>
            <Typography variant="h5" gutterBottom>
              Instructions
            </Typography>
            <video class='video_container' src="/help.mp4" frameborder="0" allowfullscreen="true" controls/>
          </div>  
        </TwoColumns>

        {/* NOTEBOOK DESCRIPTION */}
        <div style={{marginTop: '3em'}}>
          <Typography variant="h5" gutterBottom>
          Details
          </Typography>
          <NotebookInfo noImg description={metadata?.description}/>
          {metadata?.colabLink && 
          <a href={metadata?.colabLink} target="_blank">
            open in colab
          </a> 
          }
        </div>
          
    </BaseContainer>
});

const TwoColumns = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 4em;

width: 100%;
margin-top: 1em;
`

// Alert Message
const AlertMessage = ({ node }) => {
  if (node?.connected) return <></>
  return <>
      <Alert severity="info" style={{margin: '2em 0', backgroundColor: 'transparent !important'}}>
      If the text bar is locked, click on start here to unlock it. Don’t worry about the pop ups, it’s safe (:
      <br/>
      <StartHereButton {...node} />
    </Alert>
  </>
}


