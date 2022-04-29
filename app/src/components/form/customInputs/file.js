import styled from '@emotion/styled';
import { Button } from '@material-ui/core';
import Debug from 'debug';
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { getClient, getWebURL } from '../../../network/ipfsConnector';
import Thumbs from '../../atoms/Thumb';

const debug = Debug('formfile');

//     const onDrop = useCallback(async acceptedFiles => {
//       // Do something with the files
//       debug("dropped files", acceptedFiles);
//       const file = acceptedFiles[0];
//       const { cid } = await _client.add({content: file.stream(), path: file.path});


export default function Previews(props) {

  debug('props', props);
  const { value, id,  disabled, description } = props;

  const [files, setFiles] = useState([]);
  const expectedType = getType(id)


  debug('value', value)

  const { getRootProps, getInputProps } = useDropzone({
    accept: expectedType ? `${expectedType}/*` : undefined,
    onDrop: onNew
  });


  async function onNew(acceptedFiles) {
    
    debug("dropped files", acceptedFiles);

    const newFiles = await Promise.all(acceptedFiles.map(async file => {

      const { cid } = await (await getClient()).add({content: file.stream(), path: file.path});

      return {
        name: file.path, 
        url: getWebURL(cid)
      }
    }));
    
    setFiles(newFiles)

    debug("setting field value",id, newFiles[0].url)
    
    props.setFieldValue(id, `"${acceptedFiles[0].url}"`);
  }


  debug("files", files)
  
  return (<>
    
    <Disable disabled={disabled} className="container">
      <label>{id}</label>
      <Style {...getRootProps({className: 'dropzone'})} isEmpty={!files.length}>
        
        <input {...getInputProps()} disabled={disabled} />
        {
            files.length ? 
            <Thumbs files={files} />
            : <>
              <p>{description}<br/>
              Drag 'n' drop here.  </p>
            </>
        }
      </Style>
    </Disable>
    {
          files.length > 0 
          && 
          <Button onClick={() => setFiles([])}>
            [ Remove {expectedType} ]
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
