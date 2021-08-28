import readMetadata from "../utils/notebookMetadata.js";
import { getCoverImage, getCoverVideo } from "./media.js";
import mature from "../backend/mature.js";


export function getPostData(ipfs, cid, platform = null) {
  const { name, primaryInput } = readMetadata(ipfs.input["notebook.ipynb"]);

  const input = ipfs.input[primaryInput];
  const coverImage = getCoverImage(ipfs.output)[1];
  const vid = getCoverVideo(ipfs.output);
  const videoURL = Array.isArray(vid) && vid[1] ? vid[1] : coverImage;
  const url = `https://pollinations.ai/p/${cid}`;

  console.log("Calling post", { name, input, videoURL, coverImage, url });

  const principal_input = mature(input);

  const { post, title } = formatPostAndTitle(name, principal_input, url, platform);


  return { post, title, videoURL, coverImage, url };

}

const hashTags =  "#pollinations #generative #art #machinelearning";

// Shorten string and add ellipsis
function shorten(str, maxLength) {
  if (str.length > maxLength)
    return `${str.substr(0, maxLength - 3)}...`;
  return str;
}

// Twitter posts need shorter text
function formatPostForTwitter(title, modelTitle, url) {
  title = shorten(title, 100);
  modelTitle = shorten(modelTitle, 70);
  return `"${title}" ${url} ${hashTags}`;
}

function formatPostAndTitle(modelTitle, input, url, platform) {
  input = mature(input);

  const post = formatPostForTwitter(input, modelTitle, url);

  const title = `"${input}" - ${modelTitle} ${hashTags}`;

  return { post, title };

}
