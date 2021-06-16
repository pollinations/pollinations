import { Helmet } from "react-helmet";

export const SEOImage = ({url}) => 
    (<Helmet >
         <meta name="image" content={url} />
         <meta property="og:image" content={url} />
         <meta property="og:image:width" content={512} />
         <meta property="og:image:height" content={512} />
         <meta property="twitter:image" content={url} />
         
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
                <meta property="og:url" content={window.location.toString()} />                
            </Helmet>;
}