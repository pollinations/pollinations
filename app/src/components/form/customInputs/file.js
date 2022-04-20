import styled from '@emotion/styled';
import Debug from 'debug';
import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams } from 'react-router';
import Thumbs from '../../atoms/Thumb';
import Clear from '@material-ui/icons/Clear'
import { Button } from '@material-ui/core';

const debug = Debug('form/file');

export default function Previews(props) {

  const { contentID } = useParams()

  const [files, setFiles] = useState([]);
  const type = getType(props.id)

  const { getRootProps, getInputProps } = useDropzone({
    accept: `${type}/*`,
    onDrop: onNew
  });

  useEffect(() => {

    if (!props.value)
      return;

    async function hackyFetchOnMount(){
      const baseUrl = 'https://public-ipfs-gateway.pollinations.ai/ipfs/';
      debug("fetchOnMount", props)
      const fileName = props.value.slice(20, props.value.length);

      const res = await fetch(`${baseUrl}${contentID}/input/${fileName}`)
      const buf = await res.arrayBuffer()
      const file = new File([buf], fileName, { type: `${type}/${props.default.split('.').pop()}` })

      onNew([file])
    }
    hackyFetchOnMount()
    
  },[])


  function onNew(acceptedFiles) {
    setFiles(acceptedFiles.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file)
    })));
    handleChange(props.id, acceptedFiles[0], props.setFieldValue);
  }

  function handleChange(key, file, callback){
    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      let result = addName(reader.result, file.name)
      callback( key, result )
    };
    reader.onerror = (error) => {
      console.log('Error: ', error);
    };
  }
  
  // useEffect(() => {
  //   // Make sure to revoke the data uris to avoid memory leaks
  //   files.forEach(file => URL.revokeObjectURL(file.preview));
  // }, [files]);

  return (<>
    
    <Disable disabled={props.disabled} className="container">
      <label>{props.id}</label>
      <Style {...getRootProps({className: 'dropzone'})} isEmpty={!files.length}>
        
        <input {...getInputProps()} disabled={props.disabled} />
        {
            files.length ? 
            <Thumbs files={files} type={type} />
            : <>
              <p>{props.description}<br/>
              Drag 'n' drop here.  </p>
            </>
        }
      </Style>
    </Disable>
    {
          files.length > 0 
          && 
          <Button onClick={() => setFiles([])}>
            [ Remove {type} ]
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

function addName(string, name){
  let array = string.split(';')
  return `${array[0]};name=${name.replace(/\s/g, '')};${array[1]};`
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
