import React from "react";
import { Typography, Card, CardContent, GridList, GridListTile, IconButton,Button, GridListTileBar, ImageListItem } from "@material-ui/core"
import Debug from "debug";

// Icons

import { getWebURL } from "../network/ipfsConnector";
import { getMedia } from "../data/media";

const debug = Debug("ImageViewer");

const MediaDisplay = ({filename, ...props}) => 
  filename.toLowerCase().endsWith(".mp4") ? <video alt={filename} controls {...props} /> : <img alt={filename} {...props} />;

function ImageViewer({output, contentID}) {
    let images = getMedia(output);

    if (!images || images.length === 0)
      return null;

    

    
    // remove first image for large display
    const firstImage = images.shift();

    const firstFilename = firstImage[0];
    const firstURL = firstImage[1];
    
    // if more than 20 images take every nth image
    images = every_nth(images, Math.max(1,Math.floor(images.length / 20)));

    debug("images", images);
    debug("first",firstFilename, firstURL)

    return (
        <div style={{width:"100%"}}>
          <h3>Output [<Button
                href={getWebURL(`${contentID}/output`)} 
                target="_blank">
                  Open Folder
            </Button>]</h3>
          <div style={{ maxWidth:'500px', margin: '20px auto' }}>
            <MediaDisplay src={firstURL} filename={firstFilename} style={{ width: '100%'}} />
            {firstFilename}
          </div>
            
          <GridList cellHeight={200} cols={4}
            children={images.map(([filename, url]) => (
              <ImageListItem key={filename} cols={1}>
                <MediaDisplay src={url} filename={filename} style={{ margin:"5px", height:"100%" }} />
              </ImageListItem>
            ))}/>

        </div>
    )
}


export default ImageViewer;

const every_nth = (arr, nth) => arr.filter((e, i) => i % nth === nth - 1);