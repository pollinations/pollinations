import { Helmet } from "react-helmet";
import removeMarkdown from "markdown-to-text";
import { getCoverImage } from "../data/media";

export const SEOImage = ({url}) => 
    (<Helmet >
         <meta name="image" content={url} />
         <meta property="og:image" content={url} />
         <meta property="twitter:image" content={url} />
    </Helmet>);

export const SEOMetadata= ({title, description}) => {
    title = `Pollinations - ${title}`;
    title = title.slice(0,60);
    description = removeMarkdown(description);
    return  <Helmet>
                <title children={title} />
                <meta property="og:type" content="image" />
                <meta property="og:title" content={title} />
                <meta property="twitter:title" content={title} />
                <meta property="og:description" content={description} />
                <meta name="description" content={description} />
                <meta property="twitter:creator" content="pollinations_ai" />
                <meta property="twitter:description" content={description} />
                <meta property="og:url" content={window.location.toString()} />                
            </Helmet>;
}

export const SEO = ({metadata, output}) => {
    if (!metadata)
        return null;
    const coverImage = getCoverImage(output);
    const description = coverImage ? coverImage[0] : metadata.description;
    return <>
        <SEOMetadata title={metadata.name} description={description} />
        {coverImage && <SEOImage url={coverImage[1]} /> }
    </>;  
}