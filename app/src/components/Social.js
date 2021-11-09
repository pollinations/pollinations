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

const platforms = {
  "twitter": { icon: <TwitterIcon fontSize="small"/>, url: "https://twitter.com/pollinations_ai" },
  "facebook": { icon: <FacebookIcon fontSize="small"/>, url: "https://facebook.com/pollinations"},
  "linkedin": { icon: <LinkedInIcon fontSize="small"/>, url: "https://linkedin.com/company/pollinations-ai"},
  "instagram": { icon: <InstagramIcon fontSize="small"/>, url: "https://instagram.com/pollinations_ai" },
  "youtube": { icon: <YoutubeIcon fontSize="small"/>, url: "https://www.youtube.com/channel/UCk4yKnLnYfyUmCCbDzOZOug" },
  "telegram": { icon: <TelegramIcon fontSize="small"/>, url: "https://t.me/joinchat/Ft4jOGXbIyViM2My" },
};

export const SocialPostStatus = ({ results }) => 
  Object.keys(results).map(platform => PostResultLink(results[platform], platform)); 

export const SocialLinks = () => 
  <div style={{display: 'flex', alignItems: 'center', marginLeft: 'auto'}} 
  children={Object.keys(platforms).map(PlatformLink)}/>


const PlatformLink = platform => {
    return <Link 
        key={`plt_link_${platform}`} 
        href={platforms[platform].url} 
        style={{margin: '0 0.2em'}}
        target="_blank" 
        title={platform}>
        {platforms[platform].icon}
    </Link>
  }
  

const PostResultLink = ({status, message, errors, postIds, errorMessage}, platform) => {
  
  const errorMsg = errorMessage || message || (errors && errors[0] && errors[0].message);
  const color = status === "error" || errorMsg ? "error" : "inherit";

  const postURL = postIds && postIds[0]?.postUrl;

  return  <Link key={`link_${platform}`} href={postURL} target="_blank" color={color} title={errorMsg}>
            {platforms[platform].icon}
          </Link>;
}


