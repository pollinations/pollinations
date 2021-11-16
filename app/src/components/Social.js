import React from "react"
import { Link } from "@material-ui/core"
import { platforms } from '../assets/social_media'


export const SocialPostStatus = ({ results }) => 
  Object.keys(results).map(platform => results[platform] && PostResultLink(results[platform], platform)); 

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


