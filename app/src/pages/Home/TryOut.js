import styled from '@emotion/styled';
import { Button, IconButton, LinearProgress, TextField } from '@material-ui/core';
import Debug from "debug";
import React, { useEffect, useState } from "react";
import { overrideDefaultValues } from "../../components/form/helpers";
import { MediaViewer } from '../../components/MediaViewer';
import { getMedia } from '../../data/media';
import useAWSNode from '@pollinations/ipfs/reactHooks/useAWSNode';
import useIPFS from '@pollinations/ipfs/reactHooks/useIPFS';
import { GlobalSidePadding } from '../../styles/global';

// take it away
import { useFormik } from 'formik';
import { zipObj } from 'ramda';

const debug = Debug("Envisioning");

const form = {
  "Prompt": {
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

const initialCIDs = ["Qmcfqj336Uyv7oQxB6QATTFChUXJCCxW1iPRH2wGHKh3AK","QmcwfbMHVrJAqXgcZGaLM7Cm3u3kMnAhueZ8wcL8iNTUc7","QmZJahXjotRUSuuNEKvGAbiGANpsJ3Ppqam8vTAdqMP9Rk","QmSBRvNpNgVGz6UDd4QLFPC48Qwp4Vpdvn3fFf8dcMNvSA", "QmanjonRJ1KCRF57kXEPoj82aXigjxaFbLaUVFj5ztf469", "QmXdrijXCVKcsGkfBuiepZtQNTD2XqN8ZgJHTeQ46im8Vi","QmQxk7iw5XPzoMsSGRChEoaGUzw5CXBgiF4iqHdN5PpKBB","QmXbquLqdGkBJvFJwx6SVySw5Ju8ZrJV9K9nM3xnaGyn32","QmNLjhir9skGmu743kJRPXUtEmsSsmJDDKg5u1GFbZAGF8","Qmebo4fsXYknwzu3AxXtX8TZJyMfGnuraqnzKmV9fTEciV","QmcrV9syVLPo4TWyT1mE2LoUzK72fd23QDE7CxYnKoVK37"]

export default React.memo(function TryOut() {

  // select random initial CID
  const initialCID = initialCIDs[Math.floor(Math.random() * initialCIDs.length)];

  const { submitToAWS, isLoading, ipfs } = useAWSNode({contentID: initialCID});

  const inputs = ipfs?.input ? overrideDefaultValues(form, ipfs?.input) : form;

  const dispatch = async (values) => {
    await submitToAWS(values, "pollinations/preset-frontpage", Math.random() < 0.5);
  }
  
  return <PageLayout >

        <Controls dispatch={dispatch} loading={isLoading} inputs={inputs} />

        <Previewer ipfs={ipfs} />   

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

    if (!ipfs?.output) return null;

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
width: 100%;
padding: ${GlobalSidePadding};
margin-top: 5em;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
grid-gap: 0.4em;

`;

const PreviewerStyle = styled.div`
width: 80%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
grid-gap: 0.5em;

img {
  width: 100%;
}

`


