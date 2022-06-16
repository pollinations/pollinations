import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import CustomFormikForm from '../components/form/CustomFormik';
import NotebookTitle from "../components/NotebookTitle";
import useIPFSWrite from '../hooks/useIPFSWrite';

const API_URL = "http://Eleph-beecl-1X0LYRP1ZKOBL-1049606691.us-east-1.elb.amazonaws.com/pollen/"

const debug = Debug("Envisioning");

export default React.memo(function Create({navigateToNode}) {

  const ipfsWriter = useIPFSWrite()

  const inputs = {
    "Prompt": {
      type: "string",
      default: "Enter your prompt here",
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

            <CustomFormikForm inputs={inputs} onSubmit={async (values) => {
              
              // adding customEndpoint is just a way to be able to redirect back to this page from the results viewer
              // can be removed if we replace results viewer with something custom
              values = {...values, customEndpoint: "/envisioning"}

              const nodeID = await submitToAWS(values, ipfsWriter);
              navigateToNode(nodeID);
            }}/>
          </div> 
        </CenterContent>

          
    </Box>
});


// Functions

async function submitToAWS(values, ipfsWriter) {
    debug ("onSubmit", values)  

    // in real life submit parameters do IPFS and return the folder hash
    const ipfs_hash = await UploadInputstoIPFS(values, ipfsWriter);

    // debug payload
    let payload = {
      "notebook": "envisioning",
      "ipfs": ipfs_hash
    };
      
    try {
      const response = await fetch(
          API_URL, { 
          method: "POST",
          mode: 'cors',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      debug("json response", data)
      return data.pollen_id
    } catch (error) {
      debug("fetch error", error)
      return error
    }
  }


async function UploadInputstoIPFS(values, { add, mkDir, cid}){
  debug("adding values to ipfs", values)
  
  await mkDir("/input")
  for (let key in values) {
    await add(`/input/${key}`, values[key])
  }

  return await cid()
}

// STYLES
const CenterContent = styled.div`
display: flex;
justify-content: center;
align-items: center;
width: 100%;
margin-top: 1em;
`;

