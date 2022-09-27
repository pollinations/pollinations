import styled from '@emotion/styled';
import CircularProgress from '@material-ui/core/CircularProgress';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import Debug from "debug";
import React from "react";
import { overrideDefaultValues } from "../../components/form/helpers";
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import { GlobalSidePadding, MOBILE_BREAKPOINT } from '../../styles/global';

// take it away
import { Button, Step, StepLabel, Stepper } from '@material-ui/core';
import { useFormik } from 'formik';
import { last, reverse, zipObj } from 'ramda';
import { IpfsLog } from '../../components/Logs';
import { useIsAdmin } from '../../hooks/useIsAdmin';
import { useRandomPollen } from '../../hooks/useRandomPollen';

const debug = Debug("Envisioning");

const MODEL = "614871946825.dkr.ecr.us-east-1.amazonaws.com/pollinations/pimped-diffusion";

const form = {
  "prompt": {
    type: "string",
    default: "",
    title: "Prompt",
    description: "The image you want to be generated",
  },
  // "num": {
  //   type: "number",
  //   default: 4,
  //   title: "Image Count",
  //   description: "How many images to generate"
  // }
}

// const initialCIDs = [
//   "QmaCRMm2cQ9SVvgz5Afp4d1QuttU5At3ghxQgZKgXAEi44",
//   "QmP6ZqG1NYks9sh1zKGUArGToyx48n7e6iQRV3w6FfpXTM",
//   // octopus phone
//   // "QmYsfQwTyKv9KnxMTumnm9aKDWpdAzKkNH8Ap6TALzr86L",
//   // "QmcEagJ2oGxuaDZQywiKRFqdeYTKjJftxUjXM9q4heGdT6",
// ]

export default React.memo(function TryOut() {

  // select random initial CID
  const initialCID = null; // initialCIDs[Math.floor(Math.random() * initialCIDs.length)];

  const { submitToAWS, isLoading, ipfs, updatePollen, nodeID, setNodeID } = useAWSNode({});

  useRandomPollen(nodeID, MODEL, setNodeID);

  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;

  const dispatch = async (values) => {
    await submitToAWS({...values, seed: Math.floor(Math.random() * 100)}, MODEL, false, {priority: 1});
  }


  
  const [isAdmin, _] = useIsAdmin();

  const hasImageInRoot = ipfs?.output && Object.keys(ipfs.output).find(key => key.endsWith(".jpg") || key.endsWith(".png"));
  const stableDiffOutput = hasImageInRoot ? ipfs?.output : ipfs?.output && ipfs?.output["stable-diffusion"];
  
  const { pollenStatuses, prompts } = getPollenStatus(ipfs?.output?.log)


  return <PageLayout >
        <HeroSubHeadLine>
        Explain your vision with words and watch it come to life!
      </HeroSubHeadLine>


      <Controls dispatch={dispatch} loading={isLoading} inputs={inputs} />
      { isAdmin && ipfs?.output?.done === true && <Button variant="contained" color="primary" onClick={() => updatePollen({example: true})}>
                        Add to Examples
                    </Button>
                    }
      { <PollenStatus pollenStatuses={pollenStatuses} /> }
      
      <Previewer output={stableDiffOutput} prompts={prompts}/>   
      {isAdmin && <IpfsLog ipfs={ipfs} contentID={ipfs[".cid"]} /> }
      
</PageLayout>
});


const HeroSubHeadLine = styled.p`
font-family: 'DM Sans';
font-style: normal;
font-weight: 600;
font-size: 46px;
line-height: 60px;
text-align: center;

max-width: 55%;
@media (max-width: ${MOBILE_BREAKPOINT}) {
  max-width: 90%;
}

color: #FFFFFF;
/* identical to box height */

text-align: center;

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

  return <CreateForm onSubmit={formik.handleSubmit}>

  { // Basic Inputs
    Object.keys(formik.values).map(key => 
    !inputs[key].advanced && <CreateInput
        key={key}
        disabled={loading}
        id={key}
        value={formik.values[key]}
        onChange={formik.handleChange}
    />
    )
  }   
    <CreateButton disabled={loading} formik={formik} >
        {loading ? <CircularProgress thickness={2} size={20} /> : 'CREATE'}
    </CreateButton>
    

</CreateForm>
}

const CreateForm = styled.form`

display: flex;
align-items: center;
`
// move to own component
export const CreateInput = styled.input`
width: 53vw;
@media (max-width: ${MOBILE_BREAKPOINT}) {
    width: 90vw;    
}
height: 65px;
background: linear-gradient(90deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%);
border-radius: 60px;
border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 400;
font-size: 18px;
line-height: 23px;
display: flex;
align-items: center;

color: #FFFFFF;
:disabled {
  color: grey;
}
padding-left: 1.4rem;
padding-right: 9rem;
margin: 1em 0;
`
// move to own component
export const CreateButton = styled.button`

width: 129px;
height: 52;
background: rgb(233, 250, 41);
border-radius: 40px;

margin-left: ${props => props.marginLeft || 'calc(-129px - 0.5em)'};

border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 700;
font-size: 16px;
line-height: 22px;
text-align: center;
text-transform: uppercase;

color: #040405;
cursor: pointer;

:disabled {
background-color: grey;
}

`

const Previewer = ({ output, prompts }) => {

    if (!output) return null;

    const images = getMedia(output);

    
    if(!prompts) return null;
    return <PreviewerStyle
        children={
        images?.slice(0,3)
        .map(([filename, url, type], idx) => (<div>
            <MediaViewer 
            key={filename}
            content={url} 
            filename={filename} 
            type={type}
            />
            <p>
              {prompts[idx]}
            </p>
       </div>))
    }/>
}

// STYLES
const PageLayout = styled.div`
width: 100%;
padding: ${GlobalSidePadding};
margin-top: 7em;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
grid-gap: 0em;

.MuiStepIcon-root.MuiStepIcon-completed, .MuiStepIcon-root.MuiStepIcon-active{
  color: rgb(233, 250, 41) !important;
}
`;

const PreviewerStyle = styled.div`
width: 80%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
grid-gap: 3em;
padding-top: 1.5em;
img {
  width: 100%;
  max-width: 512px;
  margin: 0 auto;
}
p {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 16px;
  line-height: 22px;
  max-width: 300px;
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


function PollenStatus({pollenStatuses}) {
  if (!pollenStatuses) return null;

  return <Stepper activeStep={pollenStatuses?.length}>
    <Step key="start">
      <StepLabel>
        Connecting to the InterPlanetary FileSystem
      </StepLabel>
    </Step>
    { 
      pollenStatuses?.map(
      (pollenStatus,index) => 
        <Step key={`step_${index}`} completed={index < pollenStatuses.length-1}>
          <StepLabel>
            {pollenStatus.title}
          </StepLabel> 
        </Step>) 
    }
    </Stepper>
  ;
}



const getPollenStatus = (log) => {
  if (!log) return {
    pollenStatuses: [],
    prompts: []
  };
  const pollenStatuses = log.split("\n").filter(line => line?.startsWith("pollen_status:")).map(removePrefix);
  if (!pollenStatuses) return null;
  return ({ 
    pollenStatuses, 
    prompts: reverse(last(pollenStatuses)?.payload?.split("\n"))});
}

const removePrefix = statusWithPrefix => JSON.parse(statusWithPrefix.replace("pollen_status: ", ""));

