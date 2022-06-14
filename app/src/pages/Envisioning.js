import styled from '@emotion/styled';
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import Alert from '@material-ui/lab/Alert';
import Debug from "debug";
import React, { useCallback, useMemo } from "react";
import CustomFormikForm from '../components/form/CustomFormik';
import FormikForm from '../components/form/Formik';
import { SEO } from "../components/Helmet";
import { StartHereButton } from '../components/molecules/LaunchColabButton';
import NotebookTitle from "../components/NotebookTitle";
import NotebookInfo from '../components/organisms/markdownParsers/NotebookInfo';
import { getNotebookMetadata } from "../utils/notebookMetadata";



const debug = Debug("Envisioning");

export default React.memo(function Create() {

  const inputs = {
    "Prompt": {
      type: "string",
      default: "Enter your prompt here",
      title: "Prompt",
      description: "The image you want to be generated",
    },
    "Image_Width": {
      type: "number",
      default: 1280,
      title: "Image Width",
      description: "The width of the final image",
    },
    "Image_Height": {
      type: "number",
      default: 720,
      title: "Image Height",
      description: "The height of the final image",
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

            <CustomFormikForm
              inputs={inputs}
              onSubmit={(values) => console.log(values)}
              //input={ipfs?.input}
              //connected={connected}
              //metadata={metadata}
              //onSubmit={dispatch}
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
          
        </div>
          
    </Box>
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
      <Alert severity="info" style={{margin: '2em 0'}}>
      If the text bar is locked, click on start here to unlock it. Don’t worry about the pop ups, it’s safe (:
      <br/>
      <StartHereButton {...node} />
    </Alert>
  </>
}


