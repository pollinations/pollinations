import React from 'react';
import { Helmet } from 'react-helmet';
import removeMarkdown from 'markdown-to-text';
import Debug from 'debug';
import { getCoverImage } from '../data/media';
import { getPostData } from '../data/summaryData';

const debug = Debug('Helmet');

export function SEOImage({ url }) {
  return (
    <Helmet>
      <meta name="image" content={url} />
      <meta property="og:image" content={url} />
      <meta property="twitter:image" content={url} />
    </Helmet>
  );
}

function SEOMetadata({ title, description, url }) {
  title = `Pollinations - ${title}`;
  // title = title.slice(0,60);
  description = removeMarkdown(description);
  return (
    <Helmet>
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
    </Helmet>
  );
}

export function SEO({ ipfs, cid }) {
  if (!ipfs?.output || !ipfs?.input || !ipfs?.input['notebook.ipynb']) return null;

  const {
    coverImage, title, post: description, url,
  } = getPostData(ipfs, cid, true);
  debug('SEO', {
    coverImage, title, description, url,
  });
  return (
    <>
      <SEOMetadata title={title} description={description} url={url} />
      {coverImage && <SEOImage url={coverImage} /> }
    </>
  );
}
