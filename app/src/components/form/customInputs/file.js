import styled from '@emotion/styled';
import { Button } from '@material-ui/core';
import { getWebURL } from "@pollinations/ipfs/ipfsWebClient";
import Debug from 'debug';
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Thumbs from '../../atoms/Thumb';

const debug = Debug('formfile');


export default function Previews(props) {


  const [isUploading, setIsUploading] = useState(false)
  
  
  // const { add, cid, mkDir } = useIPFSWrite()


  debug('props', props);
  
  const { value, id,  disabled: disabledForm, description, setFieldValue, inputCID } = props;


  const disabled = disabledForm || isUploading;
  
  // if it has the new accepted_files property us it otherwise try to infer from the variable name
  const expectedTypes =  props.accepted_files ? props.accepted_files.split(",") : [getType(id)];


  const { getRootProps, getInputProps } = useDropzone({
    accept: expectedTypes ? expectedTypes.map(type => `${type}/*`) : undefined,
    onDrop: onNew
  });


  async function onNew(acceptedFiles) {
  
    debug("dropped files", acceptedFiles);

    setIsUploading(true)
    const newFiles = await Promise.all(acceptedFiles.map(async file => {


      // await add(file.path, file.stream())

      return file.path
    }));
    setIsUploading(false)
    return;
    const rootCID = await cid()
    debug("rootCID", rootCID)
    const files = Object.fromEntries(newFiles.map(path => ([path, getWebURL(`${rootCID}/${path}`)])))
    
    Object.defineProperty(files, ".cid", {value: rootCID})

    setFieldValue(id, files)
    
    setIsUploading(false)
  }


  const files = value ? Object.values(value) : []

  debug("files", files)
  
  return (<>
    
    <Disable disabled={disabled} className="container">
      <label>{id}</label>
      <Style {...getRootProps({className: 'dropzone'})} isEmpty={files.length === 0}>
        
        <input {...getInputProps()} disabled={disabled} />
        {
            files.length > 0 ? 
            <Thumbs files={files} />
            : <>
              <p>{description}<br/>
              { isUploading ? "Uploading..." : "Drag 'n' drop here." }  </p>
            </>
        }
      </Style>
    </Disable>
    {
          files.length > 0
          && 
          <Button onClick={() => setFieldValue(id, "")}>
            [ Remove ]
          </Button>
    }
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
opacity: ${props => props.disabled ? '50%' : '100%'};
`
const Style = styled.div`
min-height: 200px;
border-radius: 5px;
display: flex;
justify-content: center;
align-items: center;
border: 0.9px solid rgba(255, 236, 249, 0.5);
background-color: ${props => props.isEmpty ? 'transparent' : '#151515'};
`
