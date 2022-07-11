import styled from '@emotion/styled';
import { Button, IconButton, LinearProgress, TextField } from '@material-ui/core';
import Debug from "debug";
import React, { useEffect, useState } from "react";
import { overrideDefaultValues } from "../../components/form/helpers";
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import useAWSNode from '../../hooks/useAWS';
import useIPFS from '@pollinations/ipfs/reactHooks/useIPFS';
import useIPFSWrite from '@pollinations/ipfs/reactHooks/useIPFSWrite';
import { GlobalSidePadding } from '../../styles/global';


// take it away
import { useFormik } from 'formik';
import { zipObj } from 'ramda';

const debug = Debug("Envisioning");

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

export default React.memo(function TryOut() {

const [ currentID, setCurrentID ] = useState('bcb6b8d4cf9544c1ae60ab8e12c04523')

const { setContentID, nodeID, contentID, submitToAWS, setNodeID } = useAWSNode({NodeID: currentID});

const [ isLoading, setLoading ] = useState(false)

  const ipfs = useIPFS(contentID);
  const ipfsWriter = useIPFSWrite()

  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;
  
  useEffect(()=>{
    if ( nodeID && ipfs?.output?.done) setLoading(false)

  },[ nodeID, ipfs?.output?.done ])

  const dispatch = async (values) => {
    setLoading(true)
    const {nodeID, contentID} = await submitToAWS(values, ipfsWriter, "voodoohop/dalle-playground", false);

    setContentID(contentID)
    setCurrentID(nodeID)
    setNodeID(nodeID)
  }
  
  return <PageLayout >

        <InputBarStyle>
          {isLoading && 
          <LinearProgress style={{margin: '0.5em 0'}} />
          }
          <Controls dispatch={dispatch} loading={isLoading} inputs={inputs} />
        </InputBarStyle>

        <RowStyle>
            <Previewer ipfs={ipfs} />   
        </RowStyle>
          { currentID }
    </PageLayout>
});


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
        CREATE
    </CreateButton>
     

</CreateForm>
}

const CreateForm = styled.form`

display: flex;
align-items: center;
`

const CreateInput = styled.input`
width: 53vw;
@media (max-width: 768px) {
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
padding-left: 1rem;
margin: 1em 0;
`

const CreateButton = styled.button`

width: 129px;
height: 52;
background: #D8E449;
border-radius: 40px;

margin-left: calc(-129px - 0.5em);

border: none;

font-family: 'DM Sans';
font-style: normal;
font-weight: 700;
font-size: 17px;
line-height: 22px;
text-align: center;
text-transform: uppercase;

color: #040405;
cursor: pointer;

:disabled {
background-color: grey;
}

`

const Previewer = ({ ipfs }) => {

    if (!ipfs.output) return null;

    const images = getMedia(ipfs.output);

    return <PreviewerStyle
        children={
        images?.slice(0,3)
        .map(([filename, url, type]) => (
            <MediaViewer 
            key={filename}
            content={url} 
            filename={filename} 
            type={type}
            />
        ))
    }/>
}

// STYLES
const PageLayout = styled.div`
padding: ${GlobalSidePadding};
margin-top: 5em;
display: flex;
flex-direction: column;
grid-gap: 0.4em;

`;

const InputBarStyle = styled.div`
display: flex;
flex-direction: column;
align-items: center;
`

const PreviewerStyle = styled.div`
width: 100%;
display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 0.5em;

img {
  width: 100%;
}

`

const RowStyle = styled.div`
grid-column: 1 / 1;
@media (max-width: 640px) {
  grid-column: 1 / 1;
}
`

