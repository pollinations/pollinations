import React from "react"
import { Helmet } from "react-helmet"
import removeMarkdown from "markdown-to-text"
import seoDefaults from "../config/seo"

export const SEOImage = ({ url }) => {
  const finalUrl = url ? url : seoDefaults.image

  return (
    <Helmet>
      <meta name="image" content={finalUrl} />
      <meta property="og:image" content={finalUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="twitter:image" content={finalUrl} />
    </Helmet>
  )
}

export const SEOMetadata = ({ title, description, url }) => {
  title = title ? `Pollinations.AI - ${title}` : seoDefaults.title

  url = url ? url : seoDefaults.url
  description = description ? removeMarkdown(description) : seoDefaults.description

  return (
    <Helmet>
      <title children={title} />
      <meta property="og:title" content={title} />
      <meta property="og:type" content="website" />
      <meta property="twitter:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="description" content={description} />
      <meta property="twitter:creator" content="pollinations.ai" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:description" content={description} />
      <meta property="og:url" content={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:title" content={seoDefaults.title} />
      <meta property="og:description" content={seoDefaults.description} />
      <meta property="og:url" content={seoDefaults.url} />
      <meta property="og:image" content={seoDefaults.image} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seoDefaults.title} />
      <meta name="twitter:description" content={seoDefaults.description} />
      <meta name="twitter:image" content={seoDefaults.image} />
    </Helmet>
  )
}
