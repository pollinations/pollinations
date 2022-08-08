import { Box, Button, GridList, GridListTile, Paper } from "@material-ui/core";
import Debug from "debug";
import Markdown from 'markdown-to-jsx';
import React from "react";
import { getMedia } from "../data/media";
// Icons
import { getWebURL }  from  "@pollinations/ipfs/ipfsConnector";
import { GridStyle } from '../styles/global';
import {OBJModel} from 'react-3d-viewer'


export const MediaViewer =  ({ filename, content, type, style }) => {
  const Viewer = TypeMaps[type]
  if (!Viewer)
    return null
  debug("MediaViewer", filename, content, type)
  return <Viewer filename={filename} content={content} style={style} />
}


const debug = Debug("ImageViewer");

const VideoDisplay = ({filename, content, style}) => <video alt={filename} controls src={content} width="100%" height="auto" preload="metadata" style={style}/>
const ImageDisplay = ({filename, content, style}) => <img alt={filename} src={content} width="100%" height="auto" style={style}/>



function MediaListView({output}) {
  
    let images = getMedia(output);
    debug("images", images)
    if (!images || images.length === 0)
      return null;
    
    // if more than 20 images take every nth image
    images = every_nth(images, Math.max(1,Math.floor(images.length / 20)));

    return (
      <GridStyle>
        {
          images.map(([filename, url, type]) => (
            <MediaViewer 
              content={url} 
              filename={filename} 
              type={type}
            />
          ))
        }
      </GridStyle>
    )
}


function AudioViewer({ content, style, filename }) {
  debug("AudioViewer", content)
  return <><audio controls src={content} style={{...style, height: null}}/>{filename}</>
}

function MarkdownViewer({content, filename, style}) {
  return( <Paper variant="outlined" style={style}><Box m={2}><Markdown key={filename}>{content}</Markdown></Box></Paper>);
  
}

function ObjViewer({ content, style, filename }) {
  debug("ObjViewer", content)
  return <OBJModel src={content} style={{...style, height: null, }} background="rgba(0,0,0,0)" />
}

export default ({output, contentID}) => { 
  const media = getMedia(output)

  if (!media || media.length === 0)
    return null
  return <Box paddingTop='2em'>
      <h3>Output [<Button
          href={getWebURL(`${contentID}/output`)} 
          target="_blank">
            Download
      </Button>]</h3>
      <MediaListView output={output} />
    </Box>
}

const every_nth = (arr, nth) => arr.filter((e, i) => i % nth === nth - 1)


const TypeMaps = {
  "image": ImageDisplay,
  "video": VideoDisplay,
  "audio": AudioViewer,
  "text": MarkdownViewer,
  "3dmodel": ObjViewer
}
