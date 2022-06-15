import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import CustomFormikForm from '../components/form/CustomFormik';
import NotebookTitle from "../components/NotebookTitle";

const API_URL = "http://eleph-beecl-1OHF1H6OP0ANU-1012574990.us-east-1.elb.amazonaws.com/pollen/"

const debug = Debug("Envisioning");

export default React.memo(function Create() {

  const inputs = {
    "prompt": {
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

      
        <TwoColumns>
          {/* FORM INPUTS */}
          <div>
            
            <NotebookTitle name='Envisioning "API"' />
            <Typography variant="h5" gutterBottom>
              Inputs
            </Typography>

            <CustomFormikForm inputs={inputs} onSubmit={onSubmit}/>
          </div> 
        </TwoColumns>

          
    </Box>
});


// Functions

async function onSubmit(values){
    // in real life submit parameters do IPFS and return the folder hash

    // debug payload
    let payload = {
      "notebook": "latent-diffusion",
      "ipfs": "QmVArmzi9u4K3LoUcEwFxUyTibZ4a4BNJ3oq7qtJhTQ5dx",
    };
      
    try {
      const response = await fetch(
          API_URL, { 
          method: "POST",
          mode: 'cors',
          headers: {
            "Content-Type": "application/json"
          },
          body: payload
        }
      );
      console.log(response)
      return response
    } catch (error) {
      console.log(error)
      return error
    }
  }







// STYLES
const TwoColumns = styled.div`
display: flex;
justify-content: center;
align-items: center;
width: 100%;
margin-top: 1em;
`;

