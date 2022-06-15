import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import CustomFormikForm from '../components/form/CustomFormik';
import NotebookTitle from "../components/NotebookTitle";
import useIPFSWrite from '../hooks/useIPFSWrite';

const API_URL = "http://eleph-beecl-1OHF1H6OP0ANU-1012574990.us-east-1.elb.amazonaws.com/pollen/"

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
    "image_width": {
      type: "number",
      default: 1280,
      title: "Image Width",
      description: "The width of the final image",
    },
    "image_height": {
      type: "number",
      default: 720,
      title: "Image Height",
      description: "The height of the final image",
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
      "notebook": "latent-diffusion",
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

