import readMetadata from "../utils/notebookMetadata.js";
import { getCoverImage, getCoverVideo } from "./media.js";
import mature from "../backend/mature.js";

// Get summary data that will be used for SEO, crawlers and social posts
// Replaces mature words with ***'s
// shortenPost is useful for twitter, title and open graph tags
export function getPostData(ipfs, cid, shortenPost=true) {
  const { name, primaryInput } = readMetadata(ipfs.input["notebook.ipynb"]);

  const input = ipfs.input[primaryInput];
  const coverImage = getCoverImage(ipfs.output);
  const coverImageURL = coverImage ? coverImage[1] : null; 
  const vid = getCoverVideo(ipfs.output);
  const videoURL = Array.isArray(vid) && vid[1] ? vid[1] : coverImageURL;
  const url = `https://pollinations.ai/p/${cid}`;

  console.log("Calling post", { name, input, videoURL, coverImage: coverImageURL, url });

  const principal_input = mature(input);

  const { post, title } = formatPostAndTitle(name, principal_input, url, shortenPost);


  return { post, title, videoURL, coverImage: coverImageURL, url };

}

const hashTags =  "#pollinations #generative #art #machinelearning";


function formatPostAndTitle(modelTitle, input, url, shortenPost) {

  // Replace mature words with ***'s
  input = mature(input);

  // For twitter and open graph tags we need to shorten long titles/posts
  if (shortenPost) {
    input = shorten(input, 100);
    modelTitle = shorten(modelTitle, 70);
  }

  const title = `${input}`;
  const post = `"${title}" ${url} ${hashTags}`;
    
  return { post, title };

}



// Shorten string and add ellipsis
function shorten(str, maxLength) {
  if (str.length > maxLength)
    return `${str.substr(0, maxLength - 3)}...`;
  return str;
}
