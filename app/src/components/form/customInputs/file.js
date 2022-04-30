import styled from '@emotion/styled';
import { Button } from '@material-ui/core';
import Debug from 'debug';
import { last } from 'ramda';
import React from 'react';
import { useDropzone } from 'react-dropzone';
import useIPFSWrite from '../../../hooks/useIPFSWrite';
import { getWebURL } from '../../../network/ipfsConnector';
import Thumbs from '../../atoms/Thumb';

const debug = Debug('formfile');


export default function Previews(props) {


  const { add, cid } = useIPFSWrite()


  debug('props', props);
  const { value, id,  disabled, description } = props;

  const expectedType = getType(id)


  debug('value', value)

  const { getRootProps, getInputProps } = useDropzone({
    accept: expectedType ? `${expectedType}/*` : undefined,
    onDrop: onNew
  });


  async function onNew(acceptedFiles) {
    
    debug("dropped files", acceptedFiles);

    const newFiles = await Promise.all(acceptedFiles.map(async file => {

      await add(file.path, file.stream())

      return file.path
    }));

    const rootCID = await cid()

    const files = newFiles.map(name => ({name, url: getWebURL(rootCID+"/"+name, name)}))
    
    await close()

    debug("setting field value",id, files[0].url)
    
    props.setFieldValue(id, files[0].url);
  }


  // debug("files", files)
  const files = value ? [{url: value, name: last(value.split("/"))}] : []
  
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
