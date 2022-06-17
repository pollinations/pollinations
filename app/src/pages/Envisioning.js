import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import FormikForm from '../components/form/Formik';
import {MediaViewer} from '../components/MediaViewer';
import NotebookTitle from "../components/NotebookTitle";
import { getMedia } from '../data/media';
import useColabNode from '../hooks/useColabNode';
import useIPFS from '../hooks/useIPFS';
import useIPFSInputWrite from '../hooks/useIPFSInputWrite';
import { submitToAWS } from '../network/aws';
import { writer } from '../network/ipfsConnector';


const debug = Debug("Envisioning");

const inputs = {
  "Prompt": {
    type: "string",
    default: null,
    title: "Prompt",
    description: "The image you want to be generated",
  },
  "Modifiers": {
    type: "string",
    default: "cyber",
    title: "Style",
    enum: ['cyber', 'cgsociety', 'pixar'],
    description: "The style you choose",
  }
}

export default React.memo(function Create() {

  const { overrideNodeID, node } = useColabNode()
  

  return <PageLayout >
        <InputBarStyle>
          <Typography variant='h5' children='Envisioning' />
          <Controls overrideNodeID={overrideNodeID} />
        </InputBarStyle>

        <Previewer contentID={node.contentID}/>   
    </PageLayout>
});


const Controls = ({ overrideNodeID }) => {

  const ipfsWriter = writer()


  return <FormikForm inputs={inputs} onSubmit={async (values) =>{
      
    // adding customEndpoint is just a way to be able to redirect back to this page from the results viewer
    // can be removed if we replace results viewer with something custom
    values = {...values, customEndpoint: "/envisioning"}

    const nodeID = await submitToAWS(values, ipfsWriter);
    // navigateToNode(nodeID);
    overrideNodeID(nodeID);
  }}  />
}

const Previewer = ({ contentID }) => {

  const ipfs = useIPFS(contentID)

  if (!ipfs.output) return null;
  let images = getMedia(ipfs.output);
  return <PreviewerStyle>
    {
      images?.map(([filename, url, type]) => (
        <MediaViewer 
          content={url} 
          filename={filename} 
          type={type}
        />
      ))
    }
    </PreviewerStyle>
}

// STYLES
const PageLayout = styled.div`

display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));

grid-gap: 0.4em;
`;

const InputBarStyle = styled.div`
display: flex;
flex-direction: column;
`

const PreviewerStyle = styled.div`
grid-column: 2 / end;
@media (max-width: 640px) {
  grid-column: 1 / 1;
}

display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;

`

