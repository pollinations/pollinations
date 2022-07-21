import Debug from "debug";
import React from "react";
import { getMedia } from "../../../data/media";
// Icons
import { getWebURL }  from  "@pollinations/ipfs/ipfsConnector";
import { GridStyle } from '../../../styles/global';

import MarkdownViewer from "./Text";
import AudioViewer from "./Audio";
import ImageDisplay from "./Image";
import VideoDisplay from './Video';








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






// export default ({output, contentID}) => { 
//   const media = getMedia(output)

//   if (!media || media.length === 0)
//     return null
//   return <Box paddingTop='2em'>
//       <h3>Output [<Button
//           href={getWebURL(`${contentID}/output`)} 
//           target="_blank">
//             Download
//       </Button>]</h3>
//       <MediaListView output={output} />
//     </Box>
// }

const every_nth = (arr, nth) => arr.filter((e, i) => i % nth === nth - 1)

const TypeMaps = {
  "image": ImageDisplay,
  "video": VideoDisplay,
  "audio": AudioViewer,
  "text": MarkdownViewer
}
const MediaViewer =  ({ filename, content, type, style }) => {
    const Viewer = TypeMaps[type]
    if (!Viewer) return null;

    return <Viewer filename={filename} content={content} style={style} />
}

export default MediaViewer