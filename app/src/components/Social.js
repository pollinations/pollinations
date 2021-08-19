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


export const PostSocial = ({ results }) => 
  Object.keys(results).map(platform => PostResultLink(results[platform], platform)); 




const PostResultLink = ({status, message}, platform) => {
  const color = status === "error" ? "error" : "primary";
  return  <Link key={`link_${platform}`} href={"#"} color={color} title={message}>
            {platformIcons[platform]}
          </Link>;
}


