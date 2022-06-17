import styled from '@emotion/styled';
import { LinearProgress } from '@material-ui/core';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React, { useEffect, useState } from "react";
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
  const loading = useState(false)

  return <PageLayout >
        <InputBarStyle>
          <Typography variant='h5' children='Envisioning' />
          <Controls overrideNodeID={overrideNodeID} loading={loading} />
        </InputBarStyle>

        <RowStyle>
        <Previewer contentID={node.contentID} loading={loading}/>   
        </RowStyle>
    </PageLayout>
});


const Controls = ({ overrideNodeID, loading }) => {

  const ipfsWriter = writer()

  return <FormikForm inputs={inputs} onSubmit={async (values) =>{
    loading[1](true)
      
    // adding customEndpoint is just a way to be able to redirect back to this page from the results viewer
    // can be removed if we replace results viewer with something custom
    values = {...values, customEndpoint: "/envisioning"}

    const nodeID = await submitToAWS(values, ipfsWriter);
    // navigateToNode(nodeID);
    overrideNodeID(nodeID);
  }}  />
}

const Previewer = ({ contentID, loading }) => {

  const ipfs = useIPFS(contentID)

  const isFinished = ipfs?.output?.done;
  const [ isLoading, setLoading ] = loading;

  useEffect(() => { 
    console.log(isFinished) 
    if (isFinished) setLoading(false)  
  }, [isFinished])

  if (!ipfs.output) return null;

  const images = getMedia(ipfs.output);

  return <>
    {isLoading && 
    <LinearProgress  />
    }
    <PreviewerStyle>
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
  </>
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

