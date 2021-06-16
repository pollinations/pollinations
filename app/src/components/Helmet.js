import { Helmet } from "react-helmet";

export const SEOImage = ({url}) => 
    (<Helmet >
         <meta name="image" content={url} />
         <meta property="og:image" content={"https://pollinations.ai/ipfs/QmUGafH7Lm18Rv7737BwQq1iLBEFHjxPggaep6mtBfVJxz/output/vibrant-painting-of-a-ufo-in-the-style-of-dali_00005.png"} />
         <meta property="twitter:image" content={"https://pollinations.ai/ipfs/QmUGafH7Lm18Rv7737BwQq1iLBEFHjxPggaep6mtBfVJxz/output/vibrant-painting-of-a-ufo-in-the-style-of-dali_00005.png"} />
         <meta property="og:image:width" content={512} />
         <meta property="og:image:height" content={512} />
         
    </Helmet>);

export const SEOMetadata= ({title, description}) => {
    title = `Pollinations - ${title}`;
    return  <Helmet>
                <title children={title} />
                <meta property="og:title" content={title} />
                <meta property="twitter:title" content={title} />
                <meta property="og:description" content={description} />
                <meta property="og:description" content={description} />
                <meta name="description" content={description} />
                <meta property="twitter:creator" content="pollinations_ai" />
                <meta property="twitter:description" content={description} />                
            </Helmet>;
}