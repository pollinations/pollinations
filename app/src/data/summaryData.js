import readMetadata from "../utils/notebookMetadata.js";
import { getCoverImage, getCoverVideo, getMedia } from "./media.js";
import mature from "../backend/mature.js";
import Debug from "debug";
const debug = Debug("summaryData");

// Get summary data that will be used for SEO, crawlers and social posts
// Replaces mature words with ***'s
// shortenPost is useful for twitter, title and open graph tags
export function getPostData(ipfs, cid, shortenPost=true) {
  const { name, primaryInput } = readMetadata(ipfs.input["notebook.ipynb"]);

  // get cover image and video
  const coverImage = getCoverImage(ipfs.output);
  debug("got coverImage", coverImage);
  const coverImageURL = coverImage ? coverImage[1] : null; 
  const vid = getCoverVideo(ipfs.output);
  const videoURL = Array.isArray(vid) && vid[1] ? vid[1] : coverImageURL;
  const url = `https://pollinations.ai/p/${cid}`;

  // Check if a text was output by the run. Otherwise use the input text
  // In the future we may want to refactor this to be more flexible. E.g. when we have image inputs
  const possibleTextOutput = getMedia(ipfs.output, "text")
  const text = possibleTextOutput[0][1] || ipfs.input[primaryInput];

  // Replace mature words with ***'s
  const maturityFilteredText = mature(text);

  const { post, title } = formatPostAndTitle(name, maturityFilteredText, url, shortenPost);

  debug("Created post data", { name, text, videoURL, coverImage: coverImageURL, url });

  return { post, title, videoURL, coverImage: coverImageURL, url };

}

const hashTags =  "#pollinations #generative #art #machinelearning";


function formatPostAndTitle(modelTitle, text, url, shortenPost) {


  // For twitter and open graph tags we need to shorten long titles/posts
  if (shortenPost) {
    text = shorten(text, 160);
    modelTitle = ""//shorten(modelTitle, 70);
  }

  const title = `${text}`;
  const post = `${modelTitle} - "${title}" ${url} ${hashTags}`;
    
  return { post, title };

}



// Shorten string and add ellipsis
function shorten(str, maxLength) {
  
  debug("shortening",str, maxLength);
  
  if (!str) 
    return "";

  if (str.length > maxLength)
    return `${str.substr(0, maxLength - 3)}...`;
  return str;

}
