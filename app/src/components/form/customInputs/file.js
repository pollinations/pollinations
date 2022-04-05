import React, {useEffect, useState} from 'react';
import {useDropzone} from 'react-dropzone';
import styled from '@emotion/styled';
import Thumbs from '../../atoms/Thumb';

export default function Previews(props) {

  const [files, setFiles] = useState([]);
  const type = getType(props.id)

  const { getRootProps, getInputProps } = useDropzone({
    accept: `${type}/*`,
    onDrop: acceptedFiles => {
      setFiles(acceptedFiles.map(file => Object.assign(file, {
        preview: URL.createObjectURL(file)
      })));
      handleChange(props.id, acceptedFiles[0], props.setFieldValue);
    }
  });

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
  
  useEffect(() => {
    // Make sure to revoke the data uris to avoid memory leaks
    files.forEach(file => URL.revokeObjectURL(file.preview));
  }, [files]);

  return (
    <Disable disabled={props.disabled} className="container">
      <label>{props.id}</label>
      <Style {...getRootProps({className: 'dropzone'})} isEmpty={!files.length}>
        <input {...getInputProps()} />
        {
            files.length ? 
            <Thumbs files={files} type={type} />
            :
            <p>Drag 'n' drop a {type} here, or click to select.</p>
        }
      </Style>
    </Disable>
  );
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
