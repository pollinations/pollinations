import { any, identity, last } from "ramda";

// recognized media types
const _mediaTypeMap = {
    "all": [".jpg", ".png", ".mp4",".webm"],
    "video": [".mp4",".webm"],
    "image": [".jpg", ".png"]
  }
  
// get first image for social media and other stuff    
export const getCoverImage = output => output && getMedia(output, "image")[0];

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
  
    const imageFilenames = output ? Object.keys(output)
      .filter(filterByExtensions) : [];
  
    const images = imageFilenames.map(filename => [filename, gzipProxy(output[filename])]);
    images.reverse();
    return images
  }

const gzipProxy = path => {
  const cid = last(path.split("/"));
  return `https://images.weserv.nl/?url=https://pollinations.ai/ipfs/${cid}`;
}
  