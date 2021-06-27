import { any, identity } from "ramda";

const _mediaTypeMap = {
    "all": [".jpg", ".png", ".mp4",".webm"],
    "video": [".mp4",".webm"],
    "image": [".jpg", ".png"]
  }
  
export function getMedia(output, type="all") {
  
    const extensions = _mediaTypeMap[type];
  
    const filterByExtensions = filename => 
      any(identity, extensions.map(ext => filename.toLowerCase().endsWith(ext)));
  
    const imageFilenames = output ? Object.keys(output)
      .filter(filterByExtensions) : [];
  
    const images = imageFilenames.map(filename => [filename, output[filename]]);
    images.reverse();
    return images
  }
  
  export const getCoverImage = output => output && getMedia(output, "image")[0];
  
  export const getCoverVideo = output => output && getMedia(output, "video")[0];

  