import styled from '@emotion/styled';
import { IconButton, LinearProgress } from '@material-ui/core';
import Typography from "@material-ui/core/Typography";
import Debug from "debug";
import React from "react";
import { useNavigate, useLocation } from 'react-router';
import FormikForm from '../components/form/Formik';
import { overrideDefaultValues } from "../components/form/helpers";
import { MediaViewer } from '../components/MediaViewer';
import { getMedia } from '../data/media';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import useIPFS from '@pollinations/ipfs/reactHooks/useIPFS';
import useIPFSWrite from '@pollinations/ipfs/reactHooks/useIPFSWrite';
import { GlobalSidePadding } from '../styles/global';
import ReplayIcon from '@material-ui/icons/Replay';
import { SEOMetadata } from '../components/Helmet';

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
  const { setContentID, nodeID, contentID, submitToAWS } = useAWSNode(params);
  // const loading = useState(false)
  
  const navigateTo = useNavigate();
  
  const ipfs = useIPFS(contentID);
  const ipfsWriter = useIPFSWrite();

  debug("nodeID", nodeID);

  
  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;
  
  debug("run overrideDefaultValues on",form,ipfs?.input,"result",inputs)
  const loading = nodeID && !ipfs?.output?.done

  const dispatch = async (values) => {
    navigateTo("/envisioning/submit")
    const {nodeID, contentID} = await submitToAWS(values, ipfsWriter, "pollinations/preset-envisioning");
    debug("submitted",contentID, "to AWS. Got nodeID", nodeID)
    setContentID(contentID)
    navigateTo(`/envisioning/${nodeID}`)
  }
  
  return <PageLayout >
        <SEOMetadata title='Envisioning' />
        <InputBarStyle>
          <Typography variant='h5' children='Envisioning' />
          {loading && 
          <LinearProgress style={{margin: '0.5em 0'}} />
          }
          <Controls dispatch={dispatch} loading={loading} inputs={inputs} />
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

