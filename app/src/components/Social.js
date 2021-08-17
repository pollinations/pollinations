
import fetch from "node-fetch";
import Debug from "debug";

const debug = Debug("Social");

const platforms = ["twitter","instagram","telegram","facebook","youtube","linkedin"];


export default async function postToPlatform(contentID, platform) {
  debug(`Posting ${contentID} to ${platform}.`);
  const postFunctionURL = `https://pollinations.ai/.netlify/functions/social-post/${platform}/${contentID}`;
  const res = await fetch(postFunctionURL);
  const postResult = await res.json();
  debug(`Posted ${contentID} to ${platform}. with result:`, postResult);
}

