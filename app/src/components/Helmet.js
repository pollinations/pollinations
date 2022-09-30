import React from "react";
import { Helmet } from "react-helmet";
import removeMarkdown from "markdown-to-text";
import { getCoverImage } from "../data/media";
import { getPostData } from "../data/summaryData";
import Debug from "debug";

const debug = Debug("Helmet");

const DESCRIPTION = 'Pollinations is a platform to generate media with the help of AI. Here you can create customized, royalty-free pieces of audio, images, 3D objects and soon fully immersive 3D environments on the fly.';

export const SEOImage = ({url}) => {

    const finalUrl = url ? url : '/pollinations_landscape.jpg';

    return (<Helmet >
         <meta name="image" content={finalUrl} />
         <meta property="og:image" content={finalUrl} />
         <meta property="twitter:image" content={finalUrl} />
    </Helmet>)
};

export const SEOMetadata= ({ title, description, url }) => {
    title = title ? `Pollinations - ${title}` : 'Pollinations';

    // não é a coisa mais bonita do mundo mas é o que temos de melhor
    url = url ? url : window.location.href;
    description = description ? removeMarkdown(description) : DESCRIPTION;

    return  <Helmet>
                <title children={title} />
                <meta property="og:title" content={title} />
                <meta property="og:type" content="website" />
                <meta property="twitter:title" content={title} />
                <meta property="og:description" content={description} />
                <meta property="og:description" content={description} />
                <meta name="description" content={description} />
                <meta property="twitter:creator" content="pollinations_ai" />
                <meta property="twitter:description" content={description} />
                <meta property="og:url" content={url} />                
            </Helmet>;
}

export const SEO = ({ipfs, cid}) => {
    
    if (!ipfs?.output || !ipfs?.input || !ipfs?.input["notebook.ipynb"]) 
        return null;
    
    const { coverImage, title, post: description, url } = getPostData(ipfs, cid, true);
    debug("SEO", {coverImage, title, description, url});
    return <>
        <SEOMetadata title={title} description={description} url={url} />
        {coverImage && <SEOImage url={coverImage} /> }
    </>;  
}