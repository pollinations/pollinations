import React, { useEffect, useState } from "react";
import fetch from "node-fetch";
import Debug from "debug";

import FacebookIcon from '@material-ui/icons/Facebook';
import TwitterIcon from '@material-ui/icons/Twitter';
import LinkedInIcon from '@material-ui/icons/LinkedIn';
import InstagramIcon from '@material-ui/icons/Instagram';
import YoutubeIcon from '@material-ui/icons/Youtube';
import TelegramIcon from '@material-ui/icons/Telegram';

const debug = Debug("Social");

const platforms = ["twitter","instagram","telegram","facebook","youtube","linkedin"];

const platformIcons = {
  "twitter": TwitterIcon,
  "facebook": FacebookIcon,
  "linkedin": LinkedInIcon,
  "instagram": InstagramIcon,
  "youtube": YoutubeIcon,
  "telegram": TelegramIcon
};

export function PostSocial(contentID) {
  
}

function usePostSocial(platform, contentID) {
  const [postResult, setPostResult] = useState(null);
  
  useEffect(async () => {
    setPostResult(await postToPlatform(platform, contentID));
  },[platform, contentID]);
 
  return postResult;
}


async function postToPlatform(platform, contentID) {
  
  debug(`Posting ${contentID} to ${platform}.`);
  const postFunctionURL = `https://pollinations.ai/.netlify/functions/social-post/${platform}/${contentID}`;
  
  const res = await fetch(postFunctionURL);
  const postResult = await res.json();
  
  debug(`Posted ${contentID} to ${platform}. with result:`, postResult);

  return postResult;
}

