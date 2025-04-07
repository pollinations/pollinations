// Consolidated affiliate data for both redirect service and ad generation
// This file serves as the single source of truth for all affiliate information

// Define affiliates as a structured JSON object with all necessary data
const affiliates = [
  {
    id: "1422856",
    name: "Martinic Audio",
    product: "Martinic Kee Bass VST/AU plugin",
    description: "Get a free license for the Martinic Kee Bass VST/AU plugin, modeled on the original.",
    audience: "Music producers and sound designers looking for high-quality virtual instruments.",
    categories: ["Music & Audio", "Software"],
    trackingLink: "https://martinic.evyy.net/c/6058776/1422856/4482"
  },
  {
    id: "432264",
    name: "NordVPN",
    product: "NordVPN subscription service for secure internet browsing.",
    description: "Secure your internet browsing with a NordVPN subscription.",
    audience: "Individuals seeking online privacy and security.",
    categories: ["Software", "Internet Service Provider", "Security"],
    trackingLink: "https://nordvpn.sjv.io/c/6058776/432264/7452"
  },
  {
    id: "1548053",
    name: "jAlbum Affiliate Program",
    product: "jAlbum software for creating digital photo albums.",
    description: "Create and share digital photo albums online with jAlbum software.",
    audience: "Individuals and professionals looking to create and share photo albums online.",
    categories: ["Apps", "Creative Digital Assets", "Photography"],
    trackingLink: "https://jalbum-affiliate-program.sjv.io/c/6058776/1548053/17916"
  },
  {
    id: "1630115",
    name: "Soundcore",
    product: "Soundcore audio products and accessories",
    description: "Shop high-quality Soundcore audio products and accessories.",
    audience: "Consumers looking for high-quality audio products and accessories",
    categories: ["Consumer Electronics", "Accessories & Peripherals"],
    trackingLink: "https://soundcore.sjv.io/c/6058776/1630115/18028"
  },
  {
    id: "2073393",
    name: "CapCut Affiliate Program",
    product: "Logo and banner design services offered by CapCut.",
    description: "Enhance your brand with professional logo and banner design from CapCut.",
    audience: "Individuals and businesses looking to enhance their brand identity with a professional logo and banners.",
    categories: ["Creative Digital Assets", "Graphic Design"],
    tags: ["New logo and banners"],
    trackingLink: "https://capcutaffiliateprogram.pxf.io/c/6058776/2073393/22474"
  },
  {
    id: "2144039",
    name: "Clawcloud (Singapore) Private Limited",
    product: "Dedicated VPS hosting with high bandwidth and service availability.",
    description: "Get reliable dedicated VPS hosting with high bandwidth from Clawcloud, starting at $10/mo.",
    audience: "Businesses and individuals seeking reliable and high-performance web hosting solutions.",
    categories: ["Internet Service Provider", "Web Hosting"],
    tags: ["webhosting", "VPS", "dedicated VPS"],
    trackingLink: "https://clawcloudsingaporeprivatelimited.sjv.io/c/6058776/2144039/26865"
  },
  {
    id: "2699274",
    name: "Talkpal - AI Language Learning",
    product: "Talkpal landscape banner for promoting AI communication services.",
    description: "Explore AI-based language learning and communication solutions with Talkpal.",
    audience: "Individuals and businesses looking for AI-based communication solutions.",
    categories: ["Apps", "Software", "Internet Service Provider"],
    trackingLink: "https://talkpalinc.sjv.io/c/6058776/2699274/30644"
  },
  {
    id: "2774941",
    name: "HeyReal.AI",
    product: "Logo design services with customizable blue background options.",
    description: "Get custom logo designs and branding solutions from HeyReal.AI.",
    audience: "Individuals and businesses looking for custom logos and branding solutions.",
    categories: ["Creative Digital Assets", "Art & Photography"],
    trackingLink: "https://go.sjv.io/c/6058776/2774941/30752"
  },
  {
    id: "lovemy",
    name: "LoveMy.ai",
    product: "An AI companion that offers personalized interactions and intimacy.",
    description: "Create your intimate AI companion on LoveMy.ai",
    audience: "Individuals seeking an intimate and personalized AI companionship experience.",
    categories: ["Sexual Wellness & Adult"],
    tags: ["ai companion", "nsfw", "adult"],
    nsfw: true,
    trackingLink: "https://lovemy.ai/?linkId=lp_060145&sourceId=pollinations&tenantId=lovemyai"
  },
  {
    id: "hentai",
    name: "AIHentaiChat.com",
    product: "Uncensored AI chat services",
    description: "Explore uncensored AI chat on AIHentaiChat.com",
    audience: "Adults seeking uncensored AI chat experiences",
    categories: ["Sexual Wellness & Adult", "Apps"],
    tags: ["ai companion", "nsfw", "adult", "hentai"],
    nsfw: true,
    trackingLink: "https://aihentaichat.com/?linkId=lp_617069&sourceId=pollinations&tenantId=lovemyai"
  },
  {
    id: "kofi",
    name: "Support Pollinations on Ko-fi",
    product: "Donation platform for creators.",
    description: "Support Pollinations AI with a donation on Ko-fi",
    audience: "Individuals looking to support creators and projects financially.",
    categories: ["Charitable Causes", "Apps"],
    tags: ["donation", "support"],
    ad_text: "Powered by Pollinations.AI free text APIs. [Support our mission]({url}) to keep AI accessible for everyone.",
    trackingLink: "https://ko-fi.com/pollinationsai"
  },
  {
    id: "25841",
    name: "Kodak Photo Printer",
    product: "Kodak 4PASS photo printers and instant cameras",
    description: "Get high-quality Kodak photo printers and instant cameras with 4PASS technology for superior photo quality.",
    audience: "Photography enthusiasts and consumers looking for high-quality photo printing solutions",
    categories: ["Consumer Electronics", "Photography"],
    tags: ["photo printer", "instant camera", "4PASS technology"],
    trackingLink: "https://primedigitalmarketing.pxf.io/jeQnEb"
  }
];

// Add all other affiliates from affiliate_mapping.js that aren't already included
// This is a simplified version for the example - in reality, we would include all entries
// from the original affiliate_mapping.js file

// Function to generate markdown from the JSON data for LLM prompting
function generateMarkdownFromJSON(affiliatesData) {
  let markdown = `# Affiliate Campaign Mapping for Content Matching

Use this information to determine which affiliate campaign is most relevant to the conversation. For each campaign, consider the product type, target audience, and category to find the best match.
`;

  // Add each affiliate to the markdown
  affiliatesData.forEach(affiliate => {
    markdown += `\n## ${affiliate.name}\n\n`;
    markdown += `- **ID**: ${affiliate.id}\n`;
    markdown += `- **Product**: ${affiliate.product}\n`;
    
    if (affiliate.description) {
      markdown += `- **Description**: ${affiliate.description}\n`;
    }
    
    markdown += `- **Audience**: ${affiliate.audience}\n`;
    markdown += `- **Categories**: ${affiliate.categories.join(', ')}\n`;
    
    if (affiliate.tags) {
      markdown += `- **Tags**: ${Array.isArray(affiliate.tags) ? affiliate.tags.join(',') : affiliate.tags}\n`;
    }
    
    if (affiliate.nsfw) {
      markdown += `- **NSFW**: Yes\n`;
    }
    
    if (affiliate.ad_text) {
      markdown += `- **Ad Text**: ${affiliate.ad_text}\n`;
    }
  });

  // Add matching guidelines
  markdown += `
## Matching Guidelines

1. Match based on relevance to the conversation topic.
2. Only suggest NSFW campaigns for explicitly adult conversations.
3. For general conversations about tech, suggest software or apps.
4. If no clear match exists, default to suggesting the Ko-fi donation.
5. Don't force a match - it's better to suggest nothing than an irrelevant product.
`;

  return markdown;
}

// Create a mapping object for redirect service (id -> trackingLink)
const createRedirectMapping = (affiliatesData) => {
  return affiliatesData.reduce((acc, curr) => {
    acc[curr.id] = curr.trackingLink;
    return acc;
  }, {});
};

// Export the data and utility functions
export const affiliatesData = affiliates;
export const affiliateMarkdown = generateMarkdownFromJSON(affiliates);
export const redirectMapping = createRedirectMapping(affiliates);

// For backward compatibility, export the markdown as default
export default generateMarkdownFromJSON(affiliates);
