import React, { useEffect, useState } from "react";
import fetch from "node-fetch";
import Debug from "debug";

import FacebookIcon from '@material-ui/icons/Facebook';
import TwitterIcon from '@material-ui/icons/Twitter';
import LinkedInIcon from '@material-ui/icons/LinkedIn';
import InstagramIcon from '@material-ui/icons/Instagram';
import YoutubeIcon from '@material-ui/icons/YouTube';
import TelegramIcon from '@material-ui/icons/Telegram';
import { Link } from "@material-ui/core";

const debug = Debug("Social");

//const platforms = ["twitter","instagram","telegram","facebook","youtube","linkedin"];

const platforms = ["facebook"];

  const platformIcons = {
  "twitter": <TwitterIcon />,
  "facebook": <FacebookIcon />,
  "linkedin": <LinkedInIcon />,
  "instagram": <InstagramIcon />,
  "youtube": <YoutubeIcon />,
  "telegram": <TelegramIcon />
};


export const PostSocial = React.memo(({ contentID }) => {
  const posts = usePostSocial(contentID);

  if (posts.length === 0)
    return "Posting to social media...";

  return posts
        .filter(p => p)
        .map((postResult,index) => PostResultLink(postResult, index)); 
});


const PlatformIcon = ({index}) => platformIcons[platforms[index]];

const PostResultLink = ({status, message},index) => {
  const color = status === "error" ? "error" : "primary";
  return <Link key={`link_${index}`} href={"#"} color={color} title={message}>
      <PlatformIcon index={index} />
    </Link>;
}


function usePostSocial(contentID) {
  const [results, setResults] = useState({});
  useEffect(() => {
    for (const platform of platforms) {
      postToPlatform(platform, contentID).then(result =>
        setResults(results => ({...results, [platform]: result}))
      );
    }
  }, [contentID]);
  return Object.values(results);
}


async function postToPlatform(platform, contentID) {
  
  debug(`Posting ${contentID} to ${platform}.`);
  const postFunctionURL = `https://pollinations.ai/.netlify/functions/social-post/${platform}/${contentID}`;
  
  const res = await fetch(postFunctionURL);
  const postResult = await res.json();
  
  debug(`Posted ${contentID} to ${platform}. with result:`, postResult);

  return postResult;
}

