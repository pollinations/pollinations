import styled from '@emotion/styled';
import { IconButton, LinearProgress } from '@material-ui/core';
import Typography from "@material-ui/core/Typography";
import ReplayIcon from '@material-ui/icons/Replay';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import Debug from "debug";
import React from "react";
import { useLocation, useNavigate, useParams } from 'react-router';
import FormikForm from '../components/form/Formik';
import { overrideDefaultValues } from "../components/form/helpers";
import { SEOMetadata } from '../components/Helmet';
import { MediaViewer } from '../components/MediaViewer';
import { getMedia } from '../data/media';
import { GlobalSidePadding } from '../styles/global';

const debug = Debug("Envisioning");

const form = {
  "Prompt": {
    type: "string",
    default: "",
    title: "Prompt",
    description: "The image you want to be generated",
  }
}

export default React.memo(function Create() {

  const params = useParams()
  const { ipfs, submitToAWS, isLoading } = useAWSNode(params);
  // const loading = useState(false)
  
  const navigateTo = useNavigate();
  
  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;
  
  debug("run overrideDefaultValues on",form,ipfs?.input,"result",inputs)

  const dispatch = async (values) => {
    navigateTo("/envisioning/submit")
    const { nodeID } = await submitToAWS(values, "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/preset-envisioning");
    debug("submitted to AWS. Got nodeID", nodeID)

    navigateTo(`/envisioning/${nodeID}`)
  }
  
  return <PageLayout >
        <SEOMetadata title='Envisioning' />
        <InputBarStyle>
          <Typography variant='h5' children='Envisioning' />
          {isLoading && 
          <LinearProgress style={{margin: '0.5em 0'}} />
          }
          <Controls dispatch={dispatch} loading={isLoading} inputs={inputs} />
        </InputBarStyle>

        <RowStyle>
        <Previewer ipfs={ipfs} />   
        </RowStyle>
    </PageLayout>
});


const Controls = ({dispatch , loading, inputs }) => {

  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  return <FormikForm 
    inputs={inputs} 
    isDisabled={loading} 
    onSubmit={async (values) =>{
      dispatch(values)
    }}  
    extraAction={<>
      <IconButton
      onClick={()=> navigate(`/${pathname.split('/')[1]}`) }
      variant='outlined'
      children={<ReplayIcon/>}/>
    </>}
    />
}

const Previewer = ({ ipfs }) => {

  // const isFinished = ipfs?.output?.done;

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
padding: ${GlobalSidePadding};
margin-top: 1em;
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

