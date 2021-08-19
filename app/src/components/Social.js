import React from "react";

import Debug from "debug";

import FacebookIcon from '@material-ui/icons/Facebook';
import TwitterIcon from '@material-ui/icons/Twitter';
import LinkedInIcon from '@material-ui/icons/LinkedIn';
import InstagramIcon from '@material-ui/icons/Instagram';
import YoutubeIcon from '@material-ui/icons/YouTube';
import TelegramIcon from '@material-ui/icons/Telegram';
import { Link } from "@material-ui/core";

const debug = Debug("Social");

const platformIcons = {
  "twitter": <TwitterIcon />,
  "facebook": <FacebookIcon />,
  "linkedin": <LinkedInIcon />,
  "instagram": <InstagramIcon />,
  "youtube": <YoutubeIcon />,
  "telegram": <TelegramIcon />
};

export const SocialPostStatus = ({ results }) => 
  Object.keys(results).map(platform => PostResultLink(results[platform], platform)); 


const PostResultLink = ({status, message, errors, postIds, errorMessage}, platform) => {
  
  const errorMsg = errorMessage || message || (errors && errors[0] && errors[0].message);
  const color = status === "error" || errorMsg ? "error" : "inherit";

  const postURL = postIds && postIds[0]?.postUrl;

  return  <Link key={`link_${platform}`} href={postURL} color={color} title={errorMsg}>
            {platformIcons[platform]}
          </Link>;
}


