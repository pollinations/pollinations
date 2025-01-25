import React from "react";
import { Helmet } from "react-helmet";
import removeMarkdown from "markdown-to-text";

const DESCRIPTION = 'Pollinations.AI is a platform to generate media with the help of AI';

export const SEOImage = ({ url }) => {

    const finalUrl = url ? url : '/assets/logo/logo-text.svg';

    return (<Helmet >
        <meta name="image" content={finalUrl} />
        <meta property="og:image" content={finalUrl} />
        <meta property="twitter:image" content={finalUrl} />
    </Helmet>)
};

export const SEOMetadata = ({ title, description, url }) => {
    title = title ? `Pollinations.AI - ${title}` : 'Pollinations.AI';

    url = url ? url : window.location.href;
    description = description ? removeMarkdown(description) : DESCRIPTION;

    return <Helmet>
        <title children={title} />
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta property="twitter:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="description" content={description} />
        <meta property="twitter:creator" content="pollinations.ai" />
        <meta property="twitter:description" content={description} />
        <meta property="og:url" content={url} />
    </Helmet>;
}
