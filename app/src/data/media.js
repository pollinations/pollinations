import Debug from "debug";
import { any, identity, last } from "ramda";

const debug = Debug("media");

// recognized media types
const _mediaTypeMapWithoutAll = {

    "video": [".mp4",".webm"],
    "image": [".jpg", ".jpeg", ".png"],
    "text": [".md", ".txt"],
    "audio": [".mp3", ".wav", ".ogg",".flac"],
  }

const _mediaTypeMap = {
  ..._mediaTypeMapWithoutAll,
  "all": [...Object.values( _mediaTypeMapWithoutAll )].flat(),
}
  
export const getFileType = filename => {
  const extension = last(filename.split("."))
  return Object.entries(_mediaTypeMap).find(([type, exts]) => any(ext => ext.endsWith(extension), exts))[0]
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
// [ 
//  ["example1.jpg","/ipfs/QmdkHMPgS3gU4hQv4aY3Gchn9mwoHoBh4RVj53znzqGz8s"], 
//  ...
// ]
export function getMedia(output, type="all") {
  
    const extensions = _mediaTypeMap[type];
  
    const filterByExtensions = filename => 
      any(identity, extensions.map(ext => filename.toLowerCase().endsWith(ext)));
  
    const mediaFilenames = output ? Object.keys(output)
      .filter(filterByExtensions) : [];
  
    const media = mediaFilenames.map(filename => [filename, output[filename], getFileType(filename)]);
    media.reverse();
    return media;
  }

const gzipProxy = path => {
  const cid = last(path.split("/"));
  return `https://images.weserv.nl/?url=https://pollinations.ai/ipfs/${cid}`;
}
  


export function mediaToDisplay(output) {
  const mediaIn = getMedia(output);
  if (!mediaIn || mediaIn.length === 0) return EMPTY_MEDIA;

  // remove first image for large display
  const firstImage = mediaIn.shift()

  const images = every_nth(mediaIn);

  const first = {
      filename: firstImage[0],
      url: firstImage[1],
      type: firstImage[2]
  }

  return { images, first }
}

function every_nth(array){
  const nth = Math.max(1, Math.floor(array.length / 20))
  return array.filter((e, i) => i % nth === nth - 1)
}

const EMPTY_MEDIA = { images: [], first: {} }