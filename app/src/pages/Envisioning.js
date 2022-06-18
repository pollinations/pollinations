import styled from '@emotion/styled';
import { LinearProgress } from '@material-ui/core';
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import { useNavigate } from 'react-router';
import { useParams } from 'react-router-dom';
import FormikForm from '../components/form/Formik';
import { overrideDefaultValues } from "../components/form/helpers";
import { MediaViewer } from '../components/MediaViewer';
import { getMedia } from '../data/media';
import useColabNode from '../hooks/useColabNode';
import useIPFS from '../hooks/useIPFS';
import { submitToAWS } from '../network/aws';
import { writer } from '../network/ipfsConnector';

const debug = Debug("Envisioning");

const form = {
  "Prompt": {
    type: "string",
    default: "bla",
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
  // const loading = useState(false)
  
  const { nodeID } = useParams()
  
  const navigateTo = useNavigate()
  
  
  const ipfs = useIPFS(node.contentID)

  debug("nodeID", nodeID)

  if (nodeID && node.nodeID !== nodeID) 
    overrideNodeID(nodeID)

  
  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;
  
  debug("run overrideDefaultValues on",form,ipfs?.input,"result",inputs)
  const loading = nodeID && !ipfs?.output?.done


  
  return <PageLayout >
        <InputBarStyle>
          <Typography variant='h5' children='Envisioning' />
          {loading && 
          <LinearProgress style={{margin: '0.5em 0'}} />
          }
          <Controls showNode={nodeID => navigateTo(`/envisioning/${nodeID}`)} loading={loading} inputs={inputs} />
        </InputBarStyle>

        <RowStyle>
        <Previewer ipfs={ipfs} />   
        </RowStyle>
    </PageLayout>
});


const Controls = ({ showNode, loading, inputs }) => {

  const ipfsWriter = writer()

  return <FormikForm inputs={inputs} onSubmit={async (values) =>{
      
    // adding customEndpoint is just a way to be able to redirect back to this page from the results viewer
    // can be removed if we replace results viewer with something custom
    values = {...values, customEndpoint: "/envisioning"}

    const nodeID = await submitToAWS(values, ipfsWriter);

    showNode(nodeID);
  }}  />
}

const Previewer = ({ ipfs }) => {

  const isFinished = ipfs?.output?.done;

  if (!ipfs.output) return null;

  const images = getMedia(ipfs.output);

  return <>
    
    <PreviewerStyle>
    {
      images?.map(([filename, url, type]) => (
        <MediaViewer 
          key={filename}
          content={url} 
          filename={filename} 
          type={type}
        />
      ))
    }
    </PreviewerStyle>
  </>
}

// STYLES
const PageLayout = styled.div`

display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 0.4em;

padding: 0.5em 0;
`;

const InputBarStyle = styled.div`
display: flex;
flex-direction: column;
`

const PreviewerStyle = styled.div`
width: 100%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 0.5em;

img {
  width: 100%;
}

`

const RowStyle = styled.div`
grid-column: 2 / end;
@media (max-width: 640px) {
  grid-column: 1 / 1;
}
`

