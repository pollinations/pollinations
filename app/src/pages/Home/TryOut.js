import styled from '@emotion/styled';
import CircularProgress from '@material-ui/core/CircularProgress';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import Debug from "debug";
import React from "react";
import CreateButtonBase from '../../components/atoms/CreateButton';
import { overrideDefaultValues } from "../../components/form/helpers";
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import { Colors, Fonts, GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';

// take it away
import { Button } from '@material-ui/core';
import { useFormik } from 'formik';
import { zipObj } from 'ramda';
import { IpfsLog } from '../../components/Logs';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { useRandomPollen } from '../../hooks/useRandomPollen';

import PollenProgress from '../../components/PollenProgress'

const MODEL = "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/pimped-diffusion";

const form = {
  "prompt": {
    type: "string",
    default: "",
    title: "Prompt",
    description: "The image you want to be generated",
  },
}


export default React.memo(function TryOut() {


  const { submitToAWS, isLoading, ipfs, updatePollen, nodeID, setNodeID } = useAWSNode({});


  useRandomPollen(nodeID, MODEL, setNodeID);

  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;

  const dispatch = async (values) => {
    await submitToAWS({...values, seed: Math.floor(Math.random() * 100000)}, MODEL, false, {priority: 1});
  }

  const [isAdmin, _] = useIsAdmin();

  const hasImageInRoot = ipfs?.output && Object.keys(ipfs.output).find(key => key.endsWith(".jpg") || key.endsWith(".png"));
  const stableDiffOutput = hasImageInRoot ? ipfs?.output : ipfs?.output && ipfs?.output["stable-diffusion"];
  

  return <Style>
    <PageLayout >

    <Headline>
      TRY IT OUT!
    </Headline>
    <SubHeadline>
      Explain your vision using any language and watch it come to live. 
    </SubHeadline>

    <Controls dispatch={dispatch} loading={isLoading} inputs={inputs} />

    { isAdmin && (ipfs?.output?.done === true) && 
      <Button variant="contained" color="primary" onClick={() => updatePollen({example: true})}>
        Add to Examples
      </Button>
    }

    { isLoading ? <PollenProgress log={ipfs?.output?.log} /> : <></>}
    
    <Previewer output={stableDiffOutput} />   

    {isAdmin && <IpfsLog ipfs={ipfs} contentID={ipfs[".cid"]} /> }
      
    </PageLayout>
  </Style>
});




const Headline = styled.p`
font-family: 'Uncut-Sans-Variable';
font-style: normal;
font-weight: 500;
font-size: 56px;
line-height: 50px;
text-align: center;
text-transform: uppercase;
color: ${Colors.offblack};
margin: 0;

@media (max-width: ${MOBILE_BREAKPOINT}) {
  max-width: 90%;
  font-size: 46px;
  line-height: 50px;
}
`
const SubHeadline = styled.p`
font-family: 'Uncut-Sans-Variable';
font-style: normal;
font-weight: 400;
font-size: 22px;
line-height: 28px;
text-align: center;
color: ${Colors.gray2};
margin: 0;
margin-top: 16px;
margin-bottom: 36px;
`












const Controls = ({dispatch , loading, inputs, currentID }) => {

    if (!inputs)
    return null;

  const keys = Object.keys(inputs);
  const initialValues = zipObj( keys, keys?.map(key => inputs[key].default) );

  // Formik hook holds the form state and methods 
  const formik = useFormik({
    initialValues: initialValues,
    // validationSchema: validationSchema,
    onSubmit: async function (values) {
        dispatch(values)
   } ,
    enableReinitialize: true,
  });
  
  const key = Object.keys(formik.values)[0]

  return <CreateForm onSubmit={formik.handleSubmit}>

  <CreateInput
    key={key}
    disabled={loading}
    id={key}
    value={formik.values[key]}
    onChange={formik.handleChange}
  />
  <CreateTextArea
    key={key}
    id={key}
   maxlength={10}
   rows={4}
   value={formik.values[key]}
   onChange={formik.handleChange}
   disabled={loading}
  />
  <CreateButton disabled={loading}>
      {loading ? 'CREATING' : 'CREATE'}
  </CreateButton>
    

</CreateForm>
}
const CreateButton = styled(CreateButtonBase)`
@media (max-width: ${MOBILE_BREAKPOINT}) {
  margin: 0;
  min-width: 142px;
}
`
const CreateTextArea = styled.textarea`
resize: none;
width: 100%;

background: ${Colors.offwhite};
box-shadow: 0px 4px 24px -1px rgba(185, 185, 185, 0.24);
border-radius: 20px;
border: none;

font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;
display: flex;
align-items: center;

color: ${Colors.offblack};
padding: 0.5rem;
@media (min-width: ${MOBILE_BREAKPOINT}) {
  display: none;
}
:disabled {
  color: ${Colors.gray1};
}

`
const CreateForm = styled.form`
width: 100%;
padding: 0 1em;
display: flex;
align-items: center;
justify-content: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
flex-direction: column;
justify-content: center;
align-items: center;

gap: 1em;
}
`
// move to own component
export const CreateInput = styled.input`
width: 53vw;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 90vw;    
    padding-right: 7rem;
    display: none;
}
height: 65px;
background: ${props => props.dark ? 'linear-gradient(90deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)' : Colors.offwhite};
box-shadow: ${props => props.dark ? '' : ' 0px 4px 24px -1px rgba(185, 185, 185, 0.24)'};
border-radius: 60px;
border: none;

font-family: 'Uncut-Sans-Variable';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 22px;

color: ${props => props.dark ? Colors.offwhite : Colors.offblack};
:disabled {
  color: grey;
}
padding-left: 1.4rem;
padding-right: 9rem;
margin: 1em 0;
`


const Previewer = ({ output }) => {

    if (!output) return null;

    const images = getMedia(output);

    return <PreviewerStyle
        children={
        images?.slice(0,3)
        .map(([filename, url, type]) => 
            <MediaViewer 
            key={filename}
            content={url} 
            filename={filename} 
            type={type}
        />)
    }/>
}

// STYLES
const PageLayout = styled.div`
width: 100%;
max-width: 1440px;
min-height:80vh;
background-color: ${Colors.background_body};

margin-top: 7em;
display: flex;
flex-direction: column;
align-items: center;
// justify-content: center;
grid-gap: 0em;

.MuiStepIcon-root.MuiStepIcon-completed, .MuiStepIcon-root.MuiStepIcon-active{
  color: rgb(233, 250, 41) !important;
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
  .MuiStepper-horizontal {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 0.3em !important;
  }
}
`;

const PreviewerStyle = styled.div`
width: 80%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
grid-gap: 3em;
padding-top: 89px;
padding-bottom: 138px;
img {
  width: 100%;
  // max-width: 512px;
  margin: 0 auto;
}
p {
  font-style: normal;
  font-weight: 400;
  font-size: 16px;
  line-height: 22px;
  // max-width: 300px;
  text-overlow: ellipsis;
  @supports (-webkit-line-clamp: 4) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: initial;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
  }
}
`
const Style = styled.div`
width: 100%;
height: 100%;
position: relative;
background-color: ${Colors.background_body};
z-index: 0;

display: flex;
justify-content: center;
align-items: center;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  min-height: 674px;
}
`