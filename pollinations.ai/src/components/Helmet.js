import React from "react";
import { Helmet } from "react-helmet";
import removeMarkdown from "markdown-to-text";
import Debug from "debug";

const debug = Debug("Helmet");

const DESCRIPTION = 'Pollinations.AI is a platform to generate media with the help of AI. Here you can create customized, royalty-free pieces of audio, images, 3D objects and soon fully immersive 3D environments on the fly.';

export const SEOImage = ({ url }) => {

    const finalUrl = url ? url : '/pollinations_landscape.jpg';

    return (<Helmet >
        <meta name="image" content={finalUrl} />
        <meta property="og:image" content={finalUrl} />
        <meta property="twitter:image" content={finalUrl} />
    </Helmet>)
};

export const SEOMetadata = ({ title, description, url }) => {
    title = title ? `Pollinations.AI - ${title}` : 'Pollinations.AI';

    // não é a coisa mais bonita do mundo mas é o que temos de melhor
    url = url ? url : window.location.href;
    description = description ? removeMarkdown(description) : DESCRIPTION;

    return <Helmet>
        <title children={title} />
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta property="twitter:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:description" content={description} />
        <meta name="description" content={description} />
        <meta property="twitter:creator" content="pollinations.ai" />
        <meta property="twitter:description" content={description} />
        <meta property="og:url" content={url} />
    </Helmet>;
}
