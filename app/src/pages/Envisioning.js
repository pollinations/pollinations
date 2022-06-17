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
import { submitToAWS } from '../network/aws';


const debug = Debug("Envisioning");

export default React.memo(function Create() {

  const { overrideNodeID, node } = useColabNode()
  
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

  return <Box my={2}>

      
        <CenterContent>
          <Controls inputs={inputs} overrideNodeID={overrideNodeID} />
          <Previewer contentID={node.contentID}/>
        </CenterContent>

          
    </Box>
});


const Controls = ({ inputs, overrideNodeID }) => {


  return <div style={{ maxWidth: 300, gridColumnStart: 1, gridColumnEnd: 2}}>

    <NotebookTitle name='Envisioning "API"' />
    <Typography variant="h5" gutterBottom>
      Inputs
    </Typography>

    <FormikForm inputs={inputs} onSubmit={async (values) => {
      
      // adding customEndpoint is just a way to be able to redirect back to this page from the results viewer
      // can be removed if we replace results viewer with something custom
      values = {...values, customEndpoint: "/envisioning"}

      const nodeID = await submitToAWS(values, ipfsWriter);
      // navigateToNode(nodeID);
      overrideNodeID(nodeID);
    }}/>
  </div> 
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
const CenterContent = styled.div`
width: 100%;

display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));


margin-top: 1em;
`;

const PreviewerStyle = styled.div`

grid-column-start: 2;
grid-column-end: 4;

display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;

`

