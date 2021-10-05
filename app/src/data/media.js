import { any, identity, last } from "ramda";
import Debug from "debug";

const debug = Debug("media");

// recognized media types
const _mediaTypeMap = {
    "all": [".jpg", ".png", ".mp4",".webm"],
    "video": [".mp4",".webm"],
    "image": [".jpg", ".png"],
    "text": [".md", ".txt"],
    "audio": [".mp3", ".wav", ".ogg",".flac"],
  }
  
// get first image for social media and other stuff    
export const getCoverImage = output => { 
  const image = output && getMedia(output, "image")[0];
  debug("coverImage", image);
  return image ? [image[0], gzipProxy(image[1])] : null;
}

// get first video for social media and other stuff
export const getCoverVideo = output => output && getMedia(output, "video")[0];


// get all images and videos from ipfs output folder
//
// the parameter output is of the form 
// { 
//  "example1.jpg":"/ipfs/QmdkHMPgS3gU4hQv4aY3Gchn9mwoHoBh4RVj53znzqGz8s", 
//  ...
// }
export function getMedia(output, type="all") {
  
    const extensions = _mediaTypeMap[type];
  
    const filterByExtensions = filename => 
      any(identity, extensions.map(ext => filename.toLowerCase().endsWith(ext)));
  
    const mediaFilenames = output ? Object.keys(output)
      .filter(filterByExtensions) : [];
  
    const media = mediaFilenames.map(filename => [filename, output[filename]]);
    media.reverse();
    return media;
  }

const gzipProxy = path => {
  const cid = last(path.split("/"));
  return `https://images.weserv.nl/?url=https://pollinations.ai/ipfs/${cid}`;
}
  