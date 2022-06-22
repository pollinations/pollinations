
import fetch from "node-fetch";
import SocialPost from "social-post-api";
import { getPostData } from "../../data/summaryData";
import { IPFSWebState } from "../../network/ipfsWebClient.js";

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTION'
};


export const handler = async ({ path }) => {

  const cid = path.split("/").slice(-1)[0];
  const platform = path.split("/").slice(-2)[0];
  // your server-side functionality
  let res = await socialPost(platform, cid);
  return {
    statusCode: 200,
    body: JSON.stringify(res, null, 4),
    headers
  };
}


export async function socialPost(platform, cid) {
  console.log("platform", platform, "cid", cid, ". Fetching IPFS state");
  const ipfs = await IPFSWebState(cid);
  if (!ipfs?.input?.social) {
    console.log("Social post disabled. Aborting...");
    return;
  }

  const shortenPost = platform === "twitter"
  const data = getPostData(ipfs, cid, shortenPost);

  // Return early if the post title includes mature words.
  if (data.title.includes("*")) {
    console.log("Post contains mature words. Aborting...");
    return null;
  }

  let res = null;
  try {
    res = await doPost(data, platform);
    console.log("res", JSON.stringify(res, null, 4));
  } catch (e) {
    console.error("error", e);
    res = e;
  }
  // Send discord webhook.
  // await discordPollenPostWebhook(data);
  return res;
}

async function doPost({ post, title, videoURL, coverImage, url }, platform) {

  if (platform === "youtube" && !videoURL) {
    console.log("No video URL for youtube. Aborting...");
    return null;
  }

  post = (await autoHashtag(post)) + fixedHashTags;

  // Ayrshare API Key
  console.log("starting social post api with key", process.env["AYRSHARE_KEY"])
  const social = new SocialPost(process.env["AYRSHARE_KEY"]);

  const shareConfig = {
    post,
    title,
    youTubeOptions: {
      title,       // required: Video Title
      youTubeVisibility: "public", // optional: "public", "unlisted", or "private" - default "private"
      thumbNail: coverImage, // optional: URL of a JPEG or PNG and less than 2MB
    },
    shortenLinks: false,
    "mediaUrls": [videoURL],
    "platforms": [platform],
    autoHashtag: {
      max: 10,
      position: "auto"
    }
  };

  const postResponse = await social.post(shareConfig).catch(console.error);

  console.log("postResponse", postResponse);
  return postResponse;
}


const fixedHashTags = " #pollinations #generativeart #machinelearning";


const followText =
  `## Create
https://pollinations.ai

## Follow
https://fb.com/pollinations
https://twitter.com/pollinations_ai
https://instagram.com/pollinations_ai

#pollinations
`;


const autoHashtag = async text => {

  const res = await fetch(`https://app.ayrshare.com/api/auto-hashtag`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env["AYRSHARE_KEY"]}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      post: text,       // required
      max: 3,           // optional, range 1-5
      position: "end"  // optional, "auto" or "end"
    })
  })
  const json = await res.json()
  return json.post || text
}

