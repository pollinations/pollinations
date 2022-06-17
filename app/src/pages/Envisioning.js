import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import FormikForm from '../components/form/Formik';
import MediaViewer from '../components/MediaViewer';
import NotebookTitle from "../components/NotebookTitle";
import useColabNode from '../hooks/useColabNode';
import useIPFS from '../hooks/useIPFS';
import useIPFSWrite from '../hooks/useIPFSWrite';
import { submitToAWS } from '../network/aws';


const debug = Debug("Envisioning");

export default React.memo(function Create() {

  const ipfsWriter = useIPFSWrite()
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
          <div>

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
          <Previewer contentID={node.contentID}/>
        </CenterContent>

          
    </Box>
});

const Previewer = ({ contentID }) => {

  const ipfs = useIPFS(contentID)

  if (!ipfs.output) return null;

  return <PreviewerStyle>
    <MediaViewer output={ipfs.output} contentID={ipfs[".cid"]} />
    </PreviewerStyle>
}

// STYLES
const CenterContent = styled.div`
display: flex;
justify-content: center;
align-items: flex-start;
width: 100%;
margin-top: 1em;
`;

const PreviewerStyle = styled.div`
padding: 0 5em;
`

