import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import CustomFormikForm from '../components/form/CustomFormik';
import NotebookTitle from "../components/NotebookTitle";



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

  async function onSubmit(values){
    let payload = {
      notebook: "latent-diffusion",
      ipfs: "QmVArmzi9u4K3LoUcEwFxUyTibZ4a4BNJ3oq7qtJhTQ5dx",
    };
    let fetchConfig = { 
      method: "POST",
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
      
    try {
      let response = await fetch(
        "http://eleph-beecl-1OHF1H6OP0ANU-1012574990.us-east-1.elb.amazonaws.com/pollen/", 
        fetchConfig
      );
      console.log(response)
    } catch (error) {
      console.log(error)
    }
  }


  return <Box my={2}>

      <NotebookTitle name='Envisioning "API"' />
      
        <TwoColumns>
          {/* FORM INPUTS */}
          <div>
            <Typography variant="h5" gutterBottom>
              Inputs
            </Typography>

            <CustomFormikForm inputs={inputs} onSubmit={onSubmit}/>
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
          
        </div>
          
    </Box>
});

const TwoColumns = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
grid-gap: 4em;

width: 100%;
margin-top: 1em;
`;

