import styled from '@emotion/styled';
import { Button } from '@material-ui/core';
import Debug from 'debug';
import { last } from 'ramda';
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';

const debug = Debug('formfile');


export default function Previews(props) {


  const [isUploading, setIsUploading] = useState(false)
  
  

  debug('props', props);
  
  const { value: values, id, disabled: disabledForm, description, setFieldValue } = props;

  const value = values ? last(Object.values(values)) : undefined

  const disabled = disabledForm || isUploading;
  
  // if it has the new accepted_files property us it otherwise try to infer from the variable name
  // const expectedTypes =  props.accepted_files ? props.accepted_files.split(",") : [getType(id)];


  const { getRootProps, getInputProps } = useDropzone({
    // accept: expectedTypes ? expectedTypes.map(type => `${type}/*`) : undefined,
    onDrop: onNew
  });


  async function onNew(acceptedFiles) {
  
    debug("dropped files", acceptedFiles);
    const file = acceptedFiles[0]
    debug("got file", file)
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      setFieldValue(id, {[file.path]: reader.result})
    };
  }



  

  
  return (<>
    
    <Disable disabled={disabled} className="container">
      <label>{id}</label>
      <Style {...getRootProps({className: 'dropzone'})} isEmpty={!value}>
        
        <input {...getInputProps()} disabled={disabled} />
        {
            value ? 
            <img src={value} />
            : <>
              <p>{description}<br/>
              { isUploading ? "Uploading..." : "Drag 'n' drop here." }  </p>
            </>
        }
      </Style>
    {
          value
          && 
          <Button 
          fullWidth
            disabled={disabled} 
            onClick={() => setFieldValue(id, "")} 
            // endIcon={<Clear />} 
            children='Remove'
            style={{margin: 0}}/>
    }
    </Disable>
  </>);
}

function getType(id){
  if(`${id}`.includes('image'))
    return 'image'
  if(`${id}`.includes('video'))
    return 'video'
  if(`${id}`.includes('audio'))
    return 'audio'
}


const Disable = styled.div`
width: 100%;
opacity: ${props => props.disabled ? '50%' : '100%'};
`
const Style = styled.div`
min-height: 200px;
width: 100%;
border-radius: 5px;
display: flex;
justify-content: center;
align-items: center;
border: 0.9px solid rgba(255, 236, 249, 0.5);
background-color: ${props => props.isEmpty ? 'transparent' : '#151515'};
img {
  max-height: 50vh;
}
p {
  max-width: 90%;
}
`
