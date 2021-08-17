
import SocialPost from "social-post-api"; 
import { IPFSState } from "../../network/ipfsClient.js";
import readMetadata from "../../utils/notebookMetadata.js";
import { getCoverImage, getCoverVideo } from "../../data/media.js";
import { dissoc } from "ramda";

import mature from "../mature.js";

const hashTags =  "#pollinations #generative #art #machinelearning";

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
};


export const handler = async ({path}) => {

    const cid = path.split("/").slice(-1)[0];
    const platform = path.split("/").slice(-2)[0];
    // your server-side functionality
    console.log("platform",platform,"cid",cid,". Fetching IPFS state");
    const ipfs = await IPFSState(cid);

    const res = await postAsync(ipfs, cid, platform).catch((e) => console.error("posterror",e));
    console.log("res",JSON.stringify(res,null,4));
    return {
      statusCode: 200,
      body: JSON.stringify(res, null, 4),
      headers
    };

}



const followText =
`## Create
https://pollinations.ai

## Follow
https://fb.com/pollinations
https://twitter.com/pollinations_ai
https://instagram.com/pollinations_ai

#pollinations
`;


async function postAsync(ipfs, cid, platform) {
  const { name } = readMetadata(ipfs.input["notebook.ipynb"]);
  const input = dissoc("notebook.ipynb", ipfs.input);
  const coverImage = getCoverImage(ipfs.output)[1];
  const vid = getCoverVideo(ipfs.output);
  const videoURL = Array.isArray(vid) && vid[1] ? vid[1] : coverImage;
  const url = `https://pollinations.ai/p/${cid}`;


  console.log("Calling post", { modelTitle: name, input, videoURL, coverImage, url });
  const postResult = await doPost({ modelTitle: name, input, videoURL, coverImage, url }, platform);
  return postResult;
}



async function doPost({input, modelTitle, videoURL, coverImage, url}, platform) {

  // Live API Key
  console.log("starting social post api with key", process.env["AYRSHARE_KEY"])
  const social = new SocialPost(process.env["AYRSHARE_KEY"]);

  const inputs = mature(JSON.stringify(input,null, 4));

  const principal_input = input["text_input"];

  const { post, title } = formatPostAndTitle(modelTitle, principal_input, inputs, url, platform);

  const shareConfig = {
    post,
    title,
    youTubeOptions: {
      title,       // required: Video Title
      youTubeVisibility: "public", // optional: "public", "unlisted", or "private" - default "private"
      thumbNail: coverImage, // optional: URL of a JPEG or PNG and less than 2MB
      // playListId: "PLrav6EfwgDX5peD7Ni-pOKa7B13WjLyUB" // optional: Playlist ID to add the video
    },
    shortenLinks: false,
    "mediaUrls": [videoURL],
    "platforms": [platform]
  };

  const postResponse = await social.post(shareConfig).catch(console.error);
  console.log("postResponse", postResponse);
  return postResponse;
}


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
  return `${title} ${url} ${hashTags}`;
}

function formatPostAndTitle(modelTitle, input, inputs, url, platform) {
  input = mature(input);
  if (platform === "twitter") {
    const post = formatPostForTwitter(input, modelTitle, url);
    return { post };
  }
  const title = `"${input}" - ${modelTitle} ${hashTags}`;

  const post = `# ${title}

## Inputs
${inputs}

## Results
${url}

${followText}`;
  return { post, title };
}



// You can mention another Facebook Page by including the following in the post text. Note, Premium or Business Plan required for mentions.
// @[page-id]


if (process.argv.length > 2) {
  handler({path: process.argv[2]});
}